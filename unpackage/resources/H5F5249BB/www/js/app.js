// 主应用对象
const App = {
    config: {
        serverUrl: 'ws://your-server-ip:8080',
        deviceId: 'html5_device',
        autoConnect: true,
        reconnectInterval: 5000,
        logMaxEntries: 100
    },

    // 初始化应用
    init: function() {
        console.log('App init');
        
        // 从本地存储加载配置
        this.loadConfig();
        
        // 初始化UI事件
        this.initEvents();
        
        // 初始化WebSocket
        WebSocketManager.init(this.config.serverUrl, this.config.deviceId);
        
        // 尝试自动连接蓝牙（如果之前连接过）
        this.tryAutoConnect();
        
        this.log('应用初始化完成', 'system');
    },

    // 加载配置
    loadConfig: function() {
        const savedConfig = localStorage.getItem('serialForwarderConfig');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                Object.assign(this.config, config);
                
                // 更新UI
                $('#serverUrl').val(this.config.serverUrl);
                $('#deviceId').val(this.config.deviceId);
                $('#autoConnect').prop('checked', this.config.autoConnect);
            } catch (e) {
                console.error('加载配置失败:', e);
            }
        }
    },

    // 保存配置
    saveConfig: function() {
        this.config.serverUrl = $('#serverUrl').val().trim();
        this.config.deviceId = $('#deviceId').val().trim();
        this.config.autoConnect = $('#autoConnect').is(':checked');
        
        localStorage.setItem('serialForwarderConfig', JSON.stringify(this.config));
        
        // 更新WebSocket连接
        if (WebSocketManager.isConnected()) {
            WebSocketManager.reconnect(this.config.serverUrl, this.config.deviceId);
        }
        
        this.log('配置已保存', 'system');
        this.showToast('配置已保存', 'success');
    },

    // 初始化事件
    initEvents: function() {
        // 扫描设备按钮
        $('#scanBtn').click(() => this.scanDevices());
        
        // 连接设备按钮
        $('#connectBtn').click(() => this.showDeviceModal());
        
        // 断开连接按钮
        $('#disconnectBtn').click(() => this.disconnectDevice());
        
        // 清除日志按钮
        $('#clearLogBtn').click(() => this.clearLogs());
        
        // 保存配置按钮
        $('#saveConfigBtn').click(() => this.saveConfig());
        
        // 配置面板切换
        $('#toggleConfigBtn').click(function() {
            $('.config-body').slideToggle();
            $(this).find('i').text(
                $('.config-body').is(':visible') ? 'expand_less' : 'expand_more'
            );
        });
        
        // 发送自定义命令
        $('#sendCustomBtn').click(() => this.sendCustomCommand());
        $('#customCommand').keypress((e) => {
            if (e.which === 13) this.sendCustomCommand();
        });
        
        // 测试命令按钮
        $('.btn-test').click(function() {
            const command = $(this).data('command');
            App.sendCommand(command);
        });
        
        // 模态框关闭
        $('.close-modal').click(() => this.hideDeviceModal());
        $(window).click((e) => {
            if ($(e.target).is('#deviceModal')) {
                this.hideDeviceModal();
            }
        });
        
        // 重新扫描按钮
        $('#rescanBtn').click(() => this.scanDevices(true));
    },

    // 扫描蓝牙设备
    scanDevices: function(showModal = true) {
        this.showLoading('正在扫描蓝牙设备...');
        
        BluetoothManager.scanDevices()
            .then(devices => {
                this.hideLoading();
                
                if (devices.length === 0) {
                    this.showToast('未发现蓝牙设备', 'warning');
                    return;
                }
                
                // 显示设备列表
                if (showModal) {
                    this.showDeviceList(devices);
                    this.showDeviceModal();
                } else {
                    this.updateDeviceList(devices);
                }
                
                this.log(`发现 ${devices.length} 个蓝牙设备`, 'system');
            })
            .catch(error => {
                this.hideLoading();
                this.log(`扫描失败: ${error.message}`, 'error');
                this.showToast(`扫描失败: ${error.message}`, 'error');
            });
    },

    // 显示设备列表
    showDeviceList: function(devices) {
        const $list = $('#modalDeviceList');
        $list.empty();
        
        if (devices.length === 0) {
            $list.html('<div class="empty-state">未发现设备</div>');
            return;
        }
        
        devices.forEach(device => {
            const $item = $(`
                <div class="device-item" data-id="${device.id}">
                    <div class="device-info">
                        <div class="device-name">${device.name || '未知设备'}</div>
                        <div class="device-address">${device.id}</div>
                    </div>
                    <div class="device-type">${device.type || '未知类型'}</div>
                </div>
            `);
            
            $item.click(() => this.connectToDevice(device));
            $list.append($item);
        });
    },

    // 更新设备列表（在主页面）
    updateDeviceList: function(devices) {
        const $list = $('#deviceList');
        $list.empty();
        
        devices.forEach(device => {
            const $item = $(`
                <div class="device-item" data-id="${device.id}">
                    <div class="device-info">
                        <div class="device-name">${device.name || '未知设备'}</div>
                        <div class="device-address">${device.id}</div>
                    </div>
                    <button class="btn-small btn-primary connect-btn" data-id="${device.id}">
                        <i class="material-icons">link</i> 连接
                    </button>
                </div>
            `);
            
            $item.find('.connect-btn').click(() => this.connectToDevice(device));
            $list.append($item);
        });
    },

    // 连接到设备
    connectToDevice: function(device) {
        this.showLoading(`正在连接: ${device.name || device.id}`);
        
        BluetoothManager.connectToDevice(device.id)
            .then(() => {
                this.hideLoading();
                this.hideDeviceModal();
                
                // 保存设备信息
                this.saveDeviceInfo(device);
                
                // 更新UI
                this.updateDeviceStatus(device);
                this.log(`已连接到设备: ${device.name || device.id}`, 'system');
                this.showToast('蓝牙连接成功', 'success');
                
                // 发送测试命令
                setTimeout(() => {
                    this.sendCommand('AT');
                }, 1000);
            })
            .catch(error => {
                this.hideLoading();
                this.log(`连接失败: ${error.message}`, 'error');
                this.showToast(`连接失败: ${error.message}`, 'error');
            });
    },

    // 断开设备连接
    disconnectDevice: function() {
        BluetoothManager.disconnect()
            .then(() => {
                this.updateDeviceStatus(null);
                this.log('蓝牙连接已断开', 'system');
                this.showToast('已断开连接', 'info');
            })
            .catch(error => {
                this.log(`断开连接失败: ${error.message}`, 'error');
            });
    },

    // 保存设备信息
    saveDeviceInfo: function(device) {
        const deviceInfo = {
            id: device.id,
            name: device.name,
            type: device.type,
            lastConnected: new Date().toISOString()
        };
        localStorage.setItem('lastBluetoothDevice', JSON.stringify(deviceInfo));
    },

    // 尝试自动连接
    tryAutoConnect: function() {
        if (!this.config.autoConnect) return;
        
        const savedDevice = localStorage.getItem('lastBluetoothDevice');
        if (savedDevice) {
            try {
                const device = JSON.parse(savedDevice);
                setTimeout(() => {
                    this.log('尝试自动连接上次设备...', 'system');
                    this.connectToDevice(device);
                }, 1000);
            } catch (e) {
                console.error('自动连接失败:', e);
            }
        }
    },

    // 更新设备状态显示
    updateDeviceStatus: function(device) {
        if (device) {
            $('#bluetoothStatus').text('已连接').css('color', 'var(--success-color)');
            $('#deviceName').text(device.name || '未知设备');
            $('#deviceAddress').text(device.id);
            
            $('#connectBtn').prop('disabled', true);
            $('#disconnectBtn').prop('disabled', false);
        } else {
            $('#bluetoothStatus').text('未连接').css('color', 'var(--danger-color)');
            $('#deviceName').text('未选择');
            $('#deviceAddress').text('-');
            
            $('#connectBtn').prop('disabled', false);
            $('#disconnectBtn').prop('disabled', true);
        }
    },

    // 发送命令
    sendCommand: function(command) {
        if (!BluetoothManager.isConnected()) {
            this.showToast('蓝牙未连接', 'warning');
            return;
        }
        
        // 确保命令有换行符
        const formattedCommand = command.endsWith('\r\n') ? command : command + '\r\n';
        
        BluetoothManager.sendData(formattedCommand)
            .then(() => {
                this.log(`发送: ${command.trim()}`, 'sent');
                this.updateCommandCount();
                this.showToast('命令发送成功', 'success');
            })
            .catch(error => {
                this.log(`发送失败: ${error.message}`, 'error');
                this.showToast('发送失败', 'error');
            });
    },

    // 发送自定义命令
    sendCustomCommand: function() {
        const command = $('#customCommand').val().trim();
        if (!command) {
            this.showToast('请输入命令', 'warning');
            return;
        }
        
        this.sendCommand(command);
        $('#customCommand').val('');
    },

    // 更新命令计数
    updateCommandCount: function() {
        const count = parseInt($('#commandCount').text()) || 0;
        $('#commandCount').text(count + 1);
    },

    // 添加日志
    log: function(message, type = 'system') {
        const time = new Date().toLocaleTimeString();
        const $logContainer = $('#logContainer');
        
        const $entry = $(`
            <div class="log-entry ${type}">
                <span class="log-time">[${time}]</span>
                <span class="log-content">${message}</span>
            </div>
        `);
        
        $logContainer.append($entry);
        
        // 限制日志数量
        const $entries = $logContainer.children('.log-entry');
        if ($entries.length > this.config.logMaxEntries) {
            $entries.first().remove();
        }
        
        // 滚动到底部
        $logContainer.scrollTop($logContainer[0].scrollHeight);
    },

    // 清除日志
    clearLogs: function() {
        $('#logContainer').empty();
        this.log('日志已清除', 'system');
    },

    // 显示设备选择模态框
    showDeviceModal: function() {
        $('#deviceModal').fadeIn();
    },

    // 隐藏设备选择模态框
    hideDeviceModal: function() {
        $('#deviceModal').fadeOut();
    },

    // 显示加载遮罩
    showLoading: function(text = '正在处理...') {
        $('#loadingText').text(text);
        $('#loadingOverlay').fadeIn();
    },

    // 隐藏加载遮罩
    hideLoading: function() {
        $('#loadingOverlay').fadeOut();
    },

    // 显示Toast通知
    showToast: function(message, type = 'info') {
        toastr[type](message);
    }
};

// 导出到全局
window.App = App;