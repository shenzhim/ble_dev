var process = require('process');
var child_process = require('child_process');
var colors = require('colors');
var deviceData = {};

var buffer2Heartrate = function(data) {
	var flag = "value: ";
	if (data.indexOf(flag) === -1) return 0;

	var heartrate;
	var data = data.substring(data.indexOf(flag) + flag.length, data.length).replace("\n", "").split(" ");
	if ((data[0] & 0x01) == 0) {
		heartrate = parseInt("0x" + data[1], 16) || 0;
	} else {
		heartrate = parseInt("0x" + data[1] + data[2], 16) || 0;
	}
	return heartrate;
}

var connect_success = function(address) {
	var device = deviceData[address];
	if (device) {
		device.status = "reading";
		device.time = new Date().getTime();
		console.log(('设备：' + device.devicename + " 已连接").green);
	}
}

var disconnect = function(address) {
	var device = deviceData[address];
	if (device && device.status !== "disconnect") {

		child_process.exec("ps -ef |grep " + address + " |awk '{print $2}'|xargs kill -INT");
		device.status = "disconnect";
		device.heartrate = 0;
		console.log(('设备：' + device.devicename + " 断开连接").green);
	}
}

var connectdevice = function(address) {
	var device = deviceData[address];
	if (!device) return;

	var name = device.devicename,
		conncount = device.conncount || 0;

	device.conncount = ++conncount;


	// 'gatttool -b ' + address + ' --char-read -a 0x27'
	//var gatt = child_process.spawn("gatttool", ["-b", address, "--char-write-req", "--handle=0x0013", "--value=0100", "--listen"]);
	var gatt = child_process.exec('gatttool -b ' + address + ' --char-write-req --handle=0x0013 --value=0100 --listen');
	gatt.stdout.on('data', function(data) {
		console.log("gatttool_stdout " + name + " :" + data);
		if (data.indexOf("0x0012") === -1) return;

		device.status = "reading";
		device.time = new Date().getTime();

		var heartrate = buffer2Heartrate(data);
		if (heartrate) device.heartrate = heartrate;
	});

	gatt.stderr.on('data', function(data) {
		console.log(("gatttool_stderr " + name + " " + address + " :" + data).red);
		disconnect(address);
	});

	gatt.on("exit", function(code, signal) {
		console.log(('设备：' + name + " gatt exit").green);
		disconnect(address);
	});
}

setInterval(function() {
	for (var i in deviceData) {
		// 连接
		if (deviceData[i].status !== "reading") {
			connectdevice(i);
		}

		// 超时
		if (deviceData[i].status !== "disconnect" && deviceData[i].time + 10 * 1000 <= new Date().getTime()) {
			disconnect(i);
		}
	}
}, 1000);

module.exports = new function() {
	this.deviceData = function() {
		var rs = {};
		for (var i in deviceData) {
			rs[i] = deviceData[i];
			if (rs[i].status === "disconnect") {
				if (rs[i].time + 8 * 1000 > new Date().getTime()) {
					rs[i] = {
						devicename: rs[i].devicename,
						status: "reading",
						heartrate: rs[i].heartrate
					}
				}
			}
		}
		return rs;
		//return deviceData;
	}

	child_process.exec('killall gatttool');

	var ble = child_process.spawn("bluetoothctl");
	ble.stdout.on("data", function(data) {
		data = data.toString().split("\n");
		if (!data) return;

		data.forEach(function(d) {
			var nindex = d.indexOf("NEW"),
				cindex = d.indexOf("CHG"),
				dindex = d.indexOf("DEL");
			if (nindex === -1 && cindex === -1 && dindex === -1) return;

			var status;
			if (nindex > -1) status = d.substr(nindex, 3);
			else if (cindex > -1) status = d.substr(cindex, 3);
			else if (dindex > -1) status = d.substr(dindex, 3);

			d = d.substring(d.indexOf("] ") + 2, d.length);
			d = d.replace("Controller ", "").replace("Device ", "");

			var address = d.substr(0, 17),
				value = d.substring(18, d.length);

			if (status === "NEW") console.log("[" + (status).green + "] " + address + " " + value);
			else if (status === "CHG") console.log("[" + (status).yellow + "] " + address + " " + value);
			else console.log("[" + (status).red + "] " + address + " " + value);

			if (["NEW", "CHG"].indexOf(status) > -1 && value.indexOf("Polar H7") > -1) {
				var device = deviceData[address];
				if (device && device.status !== "disconnect") return;

				deviceData[address] = {
					status: "scan",
					heartrate: 0,
					devicename: value,
					time: new Date().getTime()
				};
			}

			if ("CHG" === status) {
				var device = deviceData[address];
				if (device && device.status === "disconnect") {
					device.status = "scan";
					device.time = new Date().getTime();
				}
			}

			if ("Connected: yes" === value) { // 设备连接成功
				connect_success(address)
			}

			if ("Connected: no" === value) { // 设备连接断开
				disconnect(address);
			}
		})
	});

	ble.on("exit", function(code, signal) {
		console.log(("ble exit code: " + code).green);
		child_process.exec('killall gatttool');
	});

	//ble.stdin.write('power off\n');
	ble.stdin.write('power on\n');
	ble.stdin.write('scan on\n');
	ble.stdin.end();
}