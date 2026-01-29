// 使用5+蓝牙API
const BluetoothManager5Plus = {
    device: null,
    service: null,
    characteristic: null,
    
    // 初始化
    init: function() {
        console.log('初始化5+蓝牙');
        // 5+会自动初始化
    },
    
    // 扫描设备
    scanDevices: function() {
        return new Promise((resolve, reject) => {
            if (!window.plus || !plus.bluetooth) {
                reject(new Error('5+蓝牙API不可用'));
                return;
            }
            
            console.log('开始扫描蓝牙设备...');
            
            plus.bluetooth.startBluetoothDevicesDiscovery({
                services: ['00001101-0000-1000-8000-00805F9B34FB'],
                allowDuplicatesKey: false,
                success: (res) => {
                    console.log('扫描开始成功');
                    
                    // 监听设备发现
                    plus.bluetooth.onBluetoothDeviceFound((res) => {
                        const devices = res.devices.map(device => ({
                            id: device.deviceId,
                            name: device.name,
                            type: this.getDeviceType(device.name)
                        }));
                        resolve(devices);
                    });
                    
                    // 10秒后自动停止
                    setTimeout(() => {
                        plus.bluetooth.stopBluetoothDevicesDiscovery();
                    }, 10000);
                },
                fail: (err) => {
                    console.error('扫描失败:', err);
                    reject(new Error(err.errMsg || '扫描失败'));
                }
            });
        });
    },
    
    // 连接到设备
    connectToDevice: function(deviceId) {
        return new Promise((resolve, reject) => {
            console.log('连接到设备:', deviceId);
            
            plus.bluetooth.createBLEConnection({
                deviceId: deviceId,
                success: (res) => {
                    console.log('连接成功:', res);
                    this.device = { id: deviceId };
                    
                    // 获取服务
                    this.getServices(deviceId)
                        .then(() => resolve(this.device))
                        .catch(reject);
                },
                fail: (err) => {
                    console.error('连接失败:', err);
                    reject(new Error(err.errMsg || '连接失败'));
                }
            });
        });
    },
    
    // 获取服务
    getServices: function(deviceId) {
        return new Promise((resolve, reject) => {
            plus.bluetooth.getBLEDeviceServices({
                deviceId: deviceId,
                success: (res) => {
                    console.log('获取服务成功:', res.services);
                    
                    // 寻找串口服务
                    const serialService = res.services.find(
                        s => s.uuid.toUpperCase() === '00001101-0000-1000-8000-00805F9B34FB'
                    );
                    
                    if (serialService) {
                        this.service = serialService;
                        this.getCharacteristics(deviceId, serialService.uuid)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        reject(new Error('未找到串口服务'));
                    }
                },
                fail: (err) => {
                    reject(new Error(err.errMsg || '获取服务失败'));
                }
            });
        });
    },
    
    // 获取特征值
    getCharacteristics: function(deviceId, serviceId) {
        return new Promise((resolve, reject) => {
            plus.bluetooth.getBLEDeviceCharacteristics({
                deviceId: deviceId,
                serviceId: serviceId,
                success: (res) => {
                    console.log('获取特征值成功:', res.characteristics);
                    
                    // 寻找可写特征值
                    const writeChar = res.characteristics.find(
                        c => c.properties.write
                    );
                    
                    if (writeChar) {
                        this.characteristic = writeChar;
                        resolve();
                    } else {
                        reject(new Error('未找到可写特征值'));
                    }
                },
                fail: (err) => {
                    reject(new Error(err.errMsg || '获取特征值失败'));
                }
            });
        });
    },
    
    // 发送数据
    sendData: function(data) {
        return new Promise((resolve, reject) => {
            if (!this.device || !this.service || !this.characteristic) {
                reject(new Error('蓝牙未连接'));
                return;
            }
            
            console.log('发送数据:', data);
            
            // 将字符串转换为ArrayBuffer
            const encoder = new TextEncoder();
            const buffer = encoder.encode(data);
            
            // 转换为base64（5+ API需要）
            const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
            
            plus.bluetooth.writeBLECharacteristicValue({
                deviceId: this.device.id,
                serviceId: this.service.uuid,
                characteristicId: this.characteristic.uuid,
                value: base64,
                success: () => {
                    console.log('发送成功');
                    resolve();
                },
                fail: (err) => {
                    console.error('发送失败:', err);
                    reject(new Error(err.errMsg || '发送失败'));
                }
            });
        });
    },
    
    // 断开连接
    disconnect: function() {
        return new Promise((resolve, reject) => {
            if (!this.device) {
                resolve();
                return;
            }
            
            plus.bluetooth.closeBLEConnection({
                deviceId: this.device.id,
                success: () => {
                    console.log('断开连接成功');
                    this.device = null;
                    this.service = null;
                    this.characteristic = null;
                    resolve();
                },
                fail: (err) => {
                    console.error('断开连接失败:', err);
                    reject(new Error(err.errMsg || '断开连接失败'));
                }
            });
        });
    },
    
    // 获取设备类型（同前）
    getDeviceType: function(deviceName) {
        // ... 同前面的实现
    },
    
    // 检查是否已连接
    isConnected: function() {
        return !!this.device;
    }
};

// 导出到全局
window.BluetoothManager = BluetoothManager5Plus;