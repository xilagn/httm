// WebSocket管理器
const WebSocketManager = {
    ws: null,
    isConnected: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    reconnectDelay: 5000,

    // 初始化WebSocket连接
    init: function(url, deviceId) {
        this.connect(url, deviceId);
    },

    // 连接到服务器
    connect: function(url, deviceId) {
        try {
            console.log('连接WebSocket服务器:', url);
            
            // 关闭现有连接
            if (this.ws) {
                this.ws.close();
            }
            
            // 创建WebSocket连接
            this.ws = new WebSocket(url);
            
            // 连接成功
            this.ws.onopen = () => {
                console.log('WebSocket连接成功');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                // 注册设备
                this.registerDevice(deviceId);
                
                // 更新UI状态
                this.updateConnectionStatus(true);
                
                // 通知应用
                if (window.App) {
                    App.log('服务器连接成功', 'system');
                    App.showToast('服务器连接成功', 'success');
                }
            };
            
            // 收到消息
            this.ws.onmessage = (event) => {
                console.log('收到WebSocket消息:', event.data);
                this.handleMessage(event.data);
            };
            
            // 连接关闭
            this.ws.onclose = (event) => {
                console.log('WebSocket连接关闭:', event.code, event.reason);
                this.isConnected = false;
                
                // 更新UI状态
                this.updateConnectionStatus(false);
                
                // 如果不是正常关闭，尝试重连
                if (event.code !== 1000) {
                    this.scheduleReconnect(url, deviceId);
                }
                
                if (window.App) {
                    App.log(`服务器连接断开: ${event.reason || '未知原因'}`, 'system');
                }
            };
            
            // 连接错误
            this.ws.onerror = (error) => {
                console.error('WebSocket连接错误:', error);
                this.isConnected = false;
                
                // 更新UI状态
                this.updateConnectionStatus(false);
                
                if (window.App) {
                    App.log('服务器连接错误', 'error');
                }
            };
            
        } catch (error) {
            console.error('创建WebSocket连接失败:', error);
            this.isConnected = false;
            this.updateConnectionStatus(false);
            
            if (window.App) {
                App.log(`连接失败: ${error.message}`, 'error');
            }
            
            // 尝试重连
            this.scheduleReconnect(url, deviceId);
        }
    },

    // 注册设备
    registerDevice: function(deviceId) {
        if (!this.isConnected || !this.ws) return;
        
        const message = JSON.stringify({
            type: 'register',
            device_id: deviceId,
            timestamp: Date.now(),
            platform: 'html5'
        });
        
        this.ws.send(message);
        console.log('发送设备注册:', message);
    },

    // 处理收到的消息
    handleMessage: function(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'command') {
                // 处理命令消息
                this.handleCommand(message);
            } else if (message.type === 'registered') {
                // 注册成功
                console.log('设备注册成功');
                if (window.App) {
                    App.log('设备注册成功', 'system');
                }
            } else if (message.type === 'error') {
                // 错误消息
                console.error('服务器错误:', message.message);
                if (window.App) {
                    App.log(`服务器错误: ${message.message}`, 'error');
                }
            }
            
        } catch (error) {
            console.error('解析消息失败:', error, data);
            
            // 如果不是JSON，直接作为命令处理
            if (typeof data === 'string') {
                this.handleCommand({ data: data });
            }
        }
    },

    // 处理命令
    handleCommand: function(message) {
        const command = message.data;
        
        console.log('收到命令:', command);
        
        if (window.App) {
            App.log(`收到服务器命令: ${command}`, 'received');
            
            // 转发到蓝牙
            if (BluetoothManager.isConnected()) {
                BluetoothManager.sendData(command + '\r\n')
                    .then(() => {
                        App.log(`已转发: ${command}`, 'sent');
                    })
                    .catch(error => {
                        App.log(`转发失败: ${error.message}`, 'error');
                    });
            } else {
                App.log('收到命令但蓝牙未连接', 'warning');
                App.showToast('收到命令但蓝牙未连接', 'warning');
            }
        }
    },

    // 发送命令到服务器
    sendCommand: function(deviceId, command) {
        if (!this.isConnected || !this.ws) {
            throw new Error('WebSocket未连接');
        }
        
        const message = JSON.stringify({
            device_id: deviceId,
            command: command,
            timestamp: Date.now(),
            source: 'html5_client'
        });
        
        this.ws.send(message);
        return true;
    },

    // 更新连接状态
    updateConnectionStatus: function(connected) {
        const $status = $('#serverStatus');
        const $dot = $status.find('.status-dot');
        const $text = $status.find('span').last();
        
        if (connected) {
            $dot.removeClass('offline').addClass('online');
            $text.text('服务器已连接');
        } else {
            $dot.removeClass('online').addClass('offline');
            $text.text('服务器未连接');
        }
    },

    // 调度重连
    scheduleReconnect: function(url, deviceId) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('达到最大重连次数，停止重连');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        
        console.log(`将在 ${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连`);
        
        if (window.App) {
            App.log(`${delay/1000}秒后尝试重连服务器 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'system');
        }
        
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connect(url, deviceId);
        }, Math.min(delay, 30000)); // 最大延迟30秒
    },

    // 重连
    reconnect: function(url, deviceId) {
        clearTimeout(this.reconnectTimer);
        this.reconnectAttempts = 0;
        this.connect(url, deviceId);
    },

    // 断开连接
    disconnect: function() {
        clearTimeout(this.reconnectTimer);
        
        if (this.ws) {
            this.ws.close(1000, '手动断开');
            this.ws = null;
        }
        
        this.isConnected = false;
        this.updateConnectionStatus(false);
    },

    // 检查是否已连接
    isConnected: function() {
        return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
    },

    // 获取连接状态
    getStatus: function() {
        if (!this.ws) return 'disconnected';
        
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'connecting';
            case WebSocket.OPEN:
                return 'connected';
            case WebSocket.CLOSING:
                return 'closing';
            case WebSocket.CLOSED:
                return 'disconnected';
            default:
                return 'unknown';
        }
    }
};

// 导出到全局
window.WebSocketManager = WebSocketManager;