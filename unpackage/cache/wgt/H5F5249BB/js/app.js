// 主应用对象
const App = {
    config: {
        serverUrl: 'ws://your-server-ip:8080', // 替换为你的服务器地址
        deviceId: null,
        autoReconnect: true,
        reconnectInterval: 5000,
        logMaxEntries: 100
    },

    state: {
        bluetoothConnected: false,
        serverConnected: false,
        scanning: false,
        currentDevice: null,
        commandCount: 0,
        receivedData: [],
        discoveredDevices: []
    },

    // 初始化应用
    init: function() {
        console.log('App init');
        
        // 初始化事件
        this.initEvents();
        
        // 加载配置
        this.loadConfig();
        
        // 检查浏览器支持
        this.checkBrowserSupport();
        
        // 初始化WebSocket
        WebSocketManager.init(this.config.serverUrl, this.config.deviceId);
        
        // 显示主界面
        setTimeout(() => {
            document.getElementById('loadingOverlay').style.display = 'none';
            document.querySelector('.container').style.display = 'block';
            this.log('应用初始化完成', 'system');
        }, 1000);
    },

    // 检查浏览器支持
    checkBrowserSupport: function() {
        if (!navigator.bluetooth) {
            this.log('浏览器不支持Web蓝牙API', 'error');
            this.showToast('您的浏览器不支持蓝牙功能', 'error');
            document.getElementById('scanBtn').disabled = true;
            return false;
        }
        
        this.log('浏览器支持Web蓝牙API', 'system');
        return true;
    },

    // 加载配置
    loadConfig: function() {
        const savedConfig = localStorage.getItem('serialForwarderConfig');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                Object.assign(this.config, config);
                
                // 更新UI
                document.getElementById('deviceIdInput').value = this.config.deviceId || '';
                if (this.config.deviceId) {
                    document.getElementById('currentDeviceIdDisplay').textContent = this.config.deviceId;
                    document.getElementById('serverDeviceId').textContent = this.config.deviceId;
                }
            } catch (e) {
                console.error('加载配置失败:', e);
            }
        }
    },

    // 保存配置
    saveConfig: function() {
        const deviceId = document.getElementById('deviceIdInput').value.trim();
        
        if (!deviceId) {
            this.showToast('请输入设备ID', 'warning');
            return;
        }
        
        if (deviceId.length < 3 || deviceId.length > 50) {
            this.showToast('设备ID长度应在3-50个字符之间', 'warning');
            return;
        }
        
        // 检查是否只包含允许的字符
        const validPattern = /^[a-zA-Z0-9_-]+$/;
        if (!validPattern.test(deviceId)) {
            this.showToast('设备ID只能包含字母、数字、下划线和连字符', 'warning');
            return;
        }
        
        this.config.deviceId = deviceId;
        localStorage.setItem('serialForwarderConfig', JSON.stringify(this.config));
        
        // 更新显示
        document.getElementById('currentDeviceIdDisplay').textContent = deviceId;
        document.getElementById('serverDeviceId').textContent = deviceId;
        document.getElementById('deviceIdInput').value = '';
        
        this.log('配置已保存', 'system');
        this.showToast('设备ID保存成功', 'success');
        
        // 更新WebSocket连接
        if (WebSocketManager.isConnected()) {
            WebSocketManager.reconnect(this.config.serverUrl, this.config.deviceId);
        }
    },

    // 初始化事件
    initEvents: function() {
        // 保存设备ID按钮
        document.getElementById('saveDeviceIdBtn').addEventListener('click', () => this.saveDeviceId());
        
        // 设备ID输入框回车保存
        document.getElementById('deviceIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveDeviceId();
        });
        
        // 扫描设备按钮
        document.getElementById('scanBtn').addEventListener('click', () => this.scanDevices());
        
        // 断开连接按钮
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnectDevice());
        
        // 发送按钮
        document.getElementById('sendBtn').addEventListener('click', () => this.sendCommand());
        
        // 回车发送命令
        document.getElementById('customCommand').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendCommand();
        });
        
        // 清除日志按钮
        document.getElementById('clearLogBtn').addEventListener('click', () => this.clearLogs());
        
        // 清空接收数据
        document.getElementById('clearReceivedBtn').addEventListener('click', () => this.clearReceivedData());
        
        // 重新连接服务器
        document.getElementById('reconnectBtn').addEventListener('click', () => this.reconnectWebSocket());
        
        // 测试服务器
        document.getElementById('testServerBtn').addEventListener('click', () => this.testServerConnection());
        
        // 快捷命令
        document.querySelectorAll('.quick-command').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const command = e.target.getAttribute('data-cmd');
                document.getElementById('customCommand').value = command;
                this.sendCommand();
            });
        });
        
        // 模态框关闭
        document.querySelector('.close-modal').addEventListener('click', () => this.hideDeviceModal());
        document.getElementById('deviceModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('deviceModal')) {
                this.hideDeviceModal();
            }
        });
        
        // 重新扫描按钮
        document.getElementById('rescanBtn').addEventListener('click', () => this.scanDevices(true));
    },

    // 扫描蓝牙设备
    scanDevices: function(showModal = true) {
        if (this.state.scanning) {
            this.showToast('正在扫描中...', 'warning');
            return;
        }
        
        this.state.scanning = true;
        this.state.discoveredDevices = [];
        
        this.showLoading('正在扫描蓝牙设备...');
        this.log('开始扫描蓝牙设备...', 'system');
        
        // 显示设备选择模态框
        if (showModal) {
            this.showDeviceModal();
            this.updateModalDeviceList([]);
        }
        
        // 使用Web蓝牙API扫描
        navigator.bluetooth.requestDevice({
            filters: [
                { services: ['00001101-0000-1000-8000-00805F9B34FB'] }, // SPP服务
                { name: 'HC-05' },
                { name: 'HC-06' },
                { name: 'BT' },
                { name: 'JDY' }
            ],
            optionalServices: ['00001101-0000-1000-8000-00805F9B34FB']
        })
        .then(device => {
            this.hideLoading();
            
            if (device) {
                const deviceInfo = {
                    id: device.id,
                    name: device.name || '未知设备',
                    device: device
                };
                
                this.state.discoveredDevices.push(deviceInfo);
                
                if (showModal) {
                    this.updateModalDeviceList(this.state.discoveredDevices);
                } else {
                    this.updateDeviceList(this.state.discoveredDevices);
                }
                
                this.log(`发现设备: ${device.name || '未知设备'}`, 'system');
                
                // 如果只发现一个设备，自动连接
                if (this.state.discoveredDevices.length === 1) {
                    this.connectToDevice(deviceInfo);
                }
            }
            
            this.state.scanning = false;
        })
        .catch(error => {
            this.hideLoading();
            this.state.scanning = false;
            
            if (error.name === 'NotFoundError') {
                this.log('未发现蓝牙设备', 'warning');
                this.showToast('未发现蓝牙设备', 'warning');
            } else if (error.name === 'SecurityError') {
                this.log('蓝牙权限被拒绝', 'error');
                this.showToast('蓝牙权限被拒绝，请检查权限设置', 'error');
            } else if (error.name === 'NetworkError') {
                this.log('网络错误，无法访问蓝牙', 'error');
                this.showToast('网络错误，无法访问蓝牙', 'error');
            } else if (error.name === 'InvalidStateError') {
                this.log('蓝牙状态无效', 'error');
                this.showToast('蓝牙状态无效，请重启蓝牙', 'error');
            } else if (error.name === 'AbortError') {
                // 用户取消选择，不显示错误
                this.log('用户取消设备选择', 'system');
            } else {
                this.log(`扫描失败: ${error.message}`, 'error');
                this.showToast(`扫描失败: ${error.message}`, 'error');
            }
            
            this.hideDeviceModal();
        });
    },

    // 显示设备列表（模态框）
    updateModalDeviceList: function(devices) {
        const container = document.getElementById('modalDeviceList');
        container.innerHTML = '';
        
        if (devices.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #666;">
                    <i class="material-icons" style="font-size: 48px; margin-bottom: 10px;">bluetooth_disabled</i>
                    <p>正在搜索设备...</p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">请确保：</p>
                    <p style="font-size: 0.85rem; color: #999; margin-top: 5px;">
                        1. 附近有蓝牙设备<br>
                        2. 设备已开启并可被发现<br>
                        3. 浏览器已获得蓝牙权限
                    </p>
                </div>
            `;
            return;
        }
        
        devices.forEach(device => {
            const item = document.createElement('div');
            item.className = 'device-item';
            item.innerHTML = `
                <div class="device-info">
                    <div class="device-name">${device.name}</div>
                    <div class="device-address">${device.id}</div>
                </div>
                <i class="material-icons" style="color: var(--primary-color);">chevron_right</i>
            `;
            
            item.addEventListener('click', () => {
                this.connectToDevice(device);
            });
            
            container.appendChild(item);
        });
    },

    // 连接到设备
    connectToDevice: function(deviceInfo) {
        if (!deviceInfo.device) {
            this.showToast('设备信息无效', 'error');
            return;
        }
        
        this.showLoading(`正在连接: ${deviceInfo.name}`);
        this.log(`正在连接设备: ${deviceInfo.name}`, 'system');
        
        // 连接设备
        deviceInfo.device.gatt.connect()
        .then(server => {
            this.log('获取蓝牙服务...', 'system');
            return server.getPrimaryService('00001101-0000-1000-8000-00805F9B34FB');
        })
        .then(service => {
            this.log('获取特征值...', 'system');
            return service.getCharacteristic('00001101-0000-1000-8000-00805F9B34FB');
        })
        .then(characteristic => {
            this.hideLoading();
            
            // 保存设备信息
            this.state.currentDevice = {
                device: deviceInfo.device,
                name: deviceInfo.name,
                id: deviceInfo.id,
                characteristic: characteristic
            };
            
            this.state.bluetoothConnected = true;
            
            // 更新UI
            this.updateDeviceStatus();
            this.hideDeviceModal();
            
            // 开始监听数据
            this.startNotifications(characteristic);
            
            this.log(`已连接到设备: ${deviceInfo.name}`, 'system');
            this.showToast('蓝牙连接成功', 'success');
            
            // 保存设备信息
            this.saveDeviceInfo(deviceInfo);
            
            // 发送测试命令
            setTimeout(() => {
                this.sendBluetoothData('AT\r\n');
            }, 1000);
        })
        .catch(error => {
            this.hideLoading();
            
            this.log(`连接失败: ${error.message}`, 'error');
            this.showToast(`连接失败: ${error.message}`, 'error');
            
            this.state.bluetoothConnected = false;
            this.updateDeviceStatus();
        });
    },

    // 开始监听数据
    startNotifications: function(characteristic) {
        characteristic.startNotifications()
        .then(() => {
            characteristic.addEventListener('characteristicvaluechanged', (event) => {
                const value = event.target.value;
                const decoder = new TextDecoder();
                const data = decoder.decode(value);
                
                if (data.trim()) {
                    this.log(`收到数据: ${data.trim()}`, 'received');
                    this.displayReceivedData(data);
                }
            });
            
            this.log('已开启数据监听', 'system');
        })
        .catch(error => {
            this.log(`开启数据监听失败: ${error.message}`, 'warning');
        });
    },

    // 断开设备连接
    disconnectDevice: function() {
        if (!this.state.currentDevice) {
            return;
        }
        
        if (this.state.currentDevice.device.gatt.connected) {
            this.state.currentDevice.device.gatt.disconnect();
        }
        
        this.state.currentDevice = null;
        this.state.bluetoothConnected = false;
        
        this.updateDeviceStatus();
        
        this.log('蓝牙连接已断开', 'system');
        this.showToast('已断开连接', 'info');
    },

    // 保存设备信息
    saveDeviceInfo: function(deviceInfo) {
        const savedInfo = {
            id: deviceInfo.id,
            name: deviceInfo.name,
            lastConnected: new Date().toISOString()
        };
        localStorage.setItem('lastBluetoothDevice', JSON.stringify(savedInfo));
    },

    // 更新设备状态显示
    updateDeviceStatus: function() {
        const statusElement = document.getElementById('bluetoothStatus');
        const statusItem = document.getElementById('bluetoothStatusItem');
        
        if (this.state.bluetoothConnected && this.state.currentDevice) {
            statusElement.textContent = '已连接';
            statusElement.style.color = 'var(--success-color)';
            statusItem.className = 'status-item connected';
            
            document.getElementById('deviceName').textContent = this.state.currentDevice.name;
            document.getElementById('deviceAddress').textContent = this.state.currentDevice.id;
            
            document.getElementById('sendBtn').disabled = false;
            document.getElementById('disconnectBtn').disabled = false;
            document.getElementById('scanBtn').disabled = true;
        } else {
            statusElement.textContent = '未连接';
            statusElement.style.color = 'var(--danger-color)';
            statusItem.className = 'status-item disconnected';
            
            document.getElementById('deviceName').textContent = '无';
            document.getElementById('deviceAddress').textContent = '-';
            
            document.getElementById('sendBtn').disabled = true;
            document.getElementById('disconnectBtn').disabled = true;
            document.getElementById('scanBtn').disabled = false;
        }
    },

    // 发送蓝牙数据
    sendBluetoothData: function(data) {
        if (!this.state.currentDevice || !this.state.currentDevice.characteristic) {
            this.showToast('蓝牙未连接', 'warning');
            return;
        }
        
        const encoder = new TextEncoder();
        const buffer = encoder.encode(data);
        
        this.state.currentDevice.characteristic.writeValue(buffer)
        .then(() => {
            this.log(`发送: ${data.trim()}`, 'sent');
            this.state.commandCount++;
            document.getElementById('commandCount').textContent = this.state.commandCount;
            this.showToast('发送成功', 'success');
        })
        .catch(error => {
            this.log(`发送失败: ${error.message}`, 'error');
            this.showToast('发送失败', 'error');
            
            // 如果发送失败，检查连接状态
            if (error.message.includes('断开') || error.message.includes('not connected')) {
                this.state.bluetoothConnected = false;
                this.updateDeviceStatus();
            }
        });
    },

    // 发送命令
    sendCommand: function() {
        const command = document.getElementById('customCommand').value.trim();
        if (!command) {
            this.showToast('请输入命令', 'warning');
            return;
        }
        
        // 确保命令有换行符
        const formattedCommand = command.endsWith('\r\n') ? command : command + '\r\n';
        this.sendBluetoothData(formattedCommand);
        
        // 清空输入框
        document.getElementById('customCommand').value = '';
        
        // 自动聚焦
        setTimeout(() => {
            document.getElementById('customCommand').focus();
        }, 100);
    },

    // 显示接收到的数据
    displayReceivedData: function(data) {
        const timestamp = new Date().toLocaleTimeString();
        const displayText = `[${timestamp}] ${data.trim()}\n`;
        
        // 保存到内存
        this.state.receivedData.push(displayText);
        
        // 限制数据量
        if (this.state.receivedData.length > 50) {
            this.state.receivedData.shift();
        }
        
        // 更新显示
        const receivedElement = document.getElementById('receivedData');
        receivedElement.textContent = this.state.receivedData.join('');
        receivedElement.scrollTop = receivedElement.scrollHeight;
    },

    // 清空接收数据
    clearReceivedData: function() {
        this.state.receivedData = [];
        document.getElementById('receivedData').textContent = '等待数据...';
        this.log('接收数据已清空', 'system');
        this.showToast('接收数据已清空', 'info');
    },

    // 添加日志
    log: function(message, type = 'system') {
        const time = new Date().toLocaleTimeString();
        const logContainer = document.getElementById('logContainer');
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-content">${message}</span>`;
        
        logContainer.appendChild(entry);
        
        // 限制日志数量
        const entries = logContainer.querySelectorAll('.log-entry');
        if (entries.length > this.config.logMaxEntries) {
            entries[0].remove();
        }
        
        // 滚动到底部
        logContainer.scrollTop = logContainer.scrollHeight;
    },

    // 清除日志
    clearLogs: function() {
        document.getElementById('logContainer').innerHTML = '';
        this.log('日志已清除', 'system');
    },

    // 显示设备选择模态框
    showDeviceModal: function() {
        document.getElementById('deviceModal').style.display = 'flex';
    },

    // 隐藏设备选择模态框
    hideDeviceModal: function() {
        document.getElementById('deviceModal').style.display = 'none';
        this.state.scanning = false;
    },

    // 显示加载遮罩
    showLoading: function(text = '正在处理...') {
        const loadingText = document.getElementById('loadingText');
        if (loadingText) loadingText.textContent = text;
        document.getElementById('loadingOverlay').style.display = 'flex';
    },

    // 隐藏加载遮罩
    hideLoading: function() {
        document.getElementById('loadingOverlay').style.display = 'none';
    },

    // 显示Toast通知
    showToast: function(message, type = 'info') {
        // 创建Toast元素
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: ${type === 'error' ? 'var(--danger-color)' : 
                        type === 'success' ? 'var(--success-color)' : 
                        type === 'warning' ? 'var(--warning-color)' : 'var(--info-color)'};
            color: white;
            padding: 12px 24px;
            border-radius: var(--border-radius);
            z-index: 1001;
            transition: transform 0.3s ease;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 3px 10px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(toast);
        
        // 显示
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
        }, 10);
        
        // 3秒后隐藏
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(100px)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 3000);
    },

    // WebSocket相关方法
    reconnectWebSocket: function() {
        WebSocketManager.reconnect(this.config.serverUrl, this.config.deviceId);
    },

    testServerConnection: function() {
        if (!this.config.deviceId) {
            this.showToast('请先设置设备ID', 'warning');
            return;
        }
        
        this.showToast('正在测试服务器连接...', 'info');
        this.log('测试服务器连接', 'system');
        
        if (WebSocketManager.isConnected()) {
            WebSocketManager.sendCommand(this.config.deviceId, 'PING');
            this.showToast('服务器连接正常', 'success');
        } else {
            this.showToast('服务器未连接', 'error');
        }
    }
};

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});