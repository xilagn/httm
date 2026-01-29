// Web蓝牙管理器
const BluetoothManager = {
    device: null,
    server: null,
    service: null,
    characteristic: null,
    isConnecting: false,

    // Web蓝牙服务UUID（标准串口服务）
    SERVICE_UUID: '00001101-0000-1000-8000-00805F9B34FB',
    CHARACTERISTIC_UUID: '00001101-0000-1000-8000-00805F9B34FB',

    // 支持的设备名称关键字
    SERIAL_DEVICE_KEYWORDS: [
        'HC-', 'BT', 'Serial', 'COM', 'UART', 'SPP',
        'RN-', 'JDY-', 'MLT-', 'BLE', 'Bluetooth'
    ],

    // 扫描蓝牙设备
    scanDevices: async function() {
        try {
            console.log('开始扫描蓝牙设备...');
            
            // 检查浏览器支持
            if (!navigator.bluetooth) {
                throw new Error('浏览器不支持Web蓝牙API');
            }
            
            // 请求蓝牙设备
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [this.SERVICE_UUID] },  // 标准SPP服务
                    { namePrefix: 'HC-' },              // HC系列设备
                    { namePrefix: 'BT' },               // BT系列设备
                    { namePrefix: 'JDY' },              // JDY系列设备
                ],
                optionalServices: [this.SERVICE_UUID]
            });
            
            return [{
                id: device.id,
                name: device.name,
                type: this.getDeviceType(device.name)
            }];
            
        } catch (error) {
            console.error('扫描设备失败:', error);
            
            // 如果用户取消选择，返回空数组
            if (error.name === 'NotFoundError' || 
                error.name === 'SecurityError' ||
                error.name === 'AbortError') {
                return [];
            }
            
            throw error;
        }
    },

    // 获取设备类型
    getDeviceType: function(deviceName) {
        if (!deviceName) return '未知';
        
        const name = deviceName.toUpperCase();
        
        if (name.includes('HC-05') || name.includes('HC-06')) {
            return 'HC系列蓝牙模块';
        } else if (name.includes('JDY')) {
            return 'JDY蓝牙模块';
        } else if (name.includes('BT-')) {
            return 'BT系列模块';
        } else if (name.includes('RN-')) {
            return 'RN系列模块';
        } else if (name.includes('SERIAL') || name.includes('COM')) {
            return '串口设备';
        } else {
            return '蓝牙设备';
        }
    },

    // 连接到设备
    connectToDevice: async function(deviceId) {
        try {
            if (this.isConnecting) {
                throw new Error('正在连接中，请稍候');
            }
            
            this.isConnecting = true;
            console.log('连接到设备:', deviceId);
            
            // 获取设备
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [this.SERVICE_UUID] }],
                optionalServices: [this.SERVICE_UUID]
            });
            
            if (!device) {
                throw new Error('设备未找到');
            }
            
            // 连接到GATT服务器
            console.log('连接到GATT服务器...');
            this.server = await device.gatt.connect();
            
            // 获取服务
            console.log('获取服务...');
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            
            // 获取特征值
            console.log('获取特征值...');
            this.characteristic = await this.service.getCharacteristic(this.CHARACTERISTIC_UUID);
            
            // 监听数据接收
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', 
                this.handleDataReceived.bind(this));
            
            this.device = device;
            this.isConnecting = false;
            
            // 监听断开事件
            device.addEventListener('gattserverdisconnected', () => {
                console.log('蓝牙连接断开');
                this.handleDisconnection();
            });
            
            console.log('蓝牙连接成功');
            return device;
            
        } catch (error) {
            this.isConnecting = false;
            console.error('连接失败:', error);
            throw error;
        }
    },

    // 处理接收到的数据
    handleDataReceived: function(event) {
        const value = event.target.value;
        const decoder = new TextDecoder();
        const data = decoder.decode(value);
        
        console.log('收到蓝牙数据:', data);
        
        // 通知应用
        if (window.App) {
            App.log(`收到: ${data.trim()}`, 'received');
        }
    },

    // 处理断开连接
    handleDisconnection: function() {
        console.log('处理断开连接');
        
        // 清理资源
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        
        // 通知应用
        if (window.App) {
            App.updateDeviceStatus(null);
            App.log('蓝牙连接已断开', 'system');
            App.showToast('蓝牙连接已断开', 'warning');
            
            // 尝试重连
            setTimeout(() => {
                App.tryAutoConnect();
            }, 3000);
        }
    },

    // 发送数据
    sendData: async function(data) {
        try {
            if (!this.isConnected()) {
                throw new Error('蓝牙未连接');
            }
            
            if (!this.characteristic) {
                throw new Error('蓝牙特征值未找到');
            }
            
            console.log('发送蓝牙数据:', data);
            
            // 将字符串转换为ArrayBuffer
            const encoder = new TextEncoder();
            const buffer = encoder.encode(data);
            
            // 发送数据
            await this.characteristic.writeValue(buffer);
            
            return true;
            
        } catch (error) {
            console.error('发送数据失败:', error);
            
            // 如果发送失败，尝试重连
            if (error.message.includes('断开') || 
                error.message.includes('not connected')) {
                this.handleDisconnection();
            }
            
            throw error;
        }
    },

    // 断开连接
    disconnect: async function() {
        try {
            if (this.device && this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }
            
            this.handleDisconnection();
            return true;
            
        } catch (error) {
            console.error('断开连接失败:', error);
            throw error;
        }
    },

    // 检查是否已连接
    isConnected: function() {
        return this.device && this.device.gatt && this.device.gatt.connected;
    },

    // 获取设备信息
    getDeviceInfo: function() {
        if (!this.device) return null;
        
        return {
            id: this.device.id,
            name: this.device.name,
            connected: this.isConnected()
        };
    },

    // 获取蓝牙状态
    getBluetoothStatus: function() {
        if (!navigator.bluetooth) {
            return 'unsupported';
        }
        
        if (this.isConnected()) {
            return 'connected';
        } else if (this.isConnecting) {
            return 'connecting';
        } else {
            return 'disconnected';
        }
    }
};

// 导出到全局
window.BluetoothManager = BluetoothManager;