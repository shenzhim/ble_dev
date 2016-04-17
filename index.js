var noble = require('noble');
var serviceuuid = "180d";
var characteruuid = "2a37";
var LOCKER = {};
var result = {};

setInterval(function() {
  var cnt = 0;
  for (var i in result) {
    cnt++;
  }
  console.log(cnt, result);
}, 1000);

noble.on('stateChange', function(state) {
  if (state === 'poweredOn') {
    noble.startScanning([serviceuuid], true);
    console.log("开始扫描")
  } else {
    noble.stopScanning();
    console.log("结束扫描")
  }
});

noble.on('discover', function(peripheral) {
  var serviceUuids = peripheral.advertisement.serviceUuids || [],
    localName = peripheral.advertisement.localName || "";

  if (serviceUuids.indexOf(serviceuuid) === -1) return;
  if (LOCKER[localName]) return;

  result[localName] = 0;
  try {
    LOCKER[localName] = true;

    peripheral.connect(function(error) { // 连接设备
      if (error) {
        console.log("设备[%s] 连接失败！error: %s", peripheralname, error);
        return;
      }
      console.log('设备[%s] 已连接！', peripheralname);

      // 发现服务
      peripheral.discoverServices([serviceuuid], function(error, services) {
        var heartRateService = services[0];

        // 发现特征值
        heartRateService.discoverCharacteristics([characteruuid], function(error, characteristics) {
          var chara = characteristics[0];

          // 读取特征值
          chara.on('read', function(data, isNotification) {
            result[localName] = data.readUInt8(1);
          });

          // 准备接收数据
          chara.notify(true, function(error) {
            //console.log('设备[%s] 接收数据中。。。', peripheralname);
          });
        });
      });

      // 断开连接
      peripheral.once('disconnect', function() {
        console.log("设备[%s] 已断开连接！", peripheralname);
        peripheral.disconnect();
        delete LOCKER[localName];
        delete result[localName];
      });
    });
  } catch (e) {
    console.log("设备[%s] error！", e);
    delete LOCKER[localName];
    delete result[localName];
  }
});