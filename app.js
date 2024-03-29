// phidgets-mqtt bridge
// Map Phidget DigitalOut to MQTT
//
// Matthew Currie VE7MJC
//
// COMMANDS
//
// Set DigitalOutput
// Topic: TOPIC_PREFIX/{board_num}/{io_type}/{channel}/set
// Payload: "true"|"on"|"1" = ON; "false"|"off"|"0" = OFF;
//
// Observe DigitalOutput state
// Topic TOPIC_PREFIX/{board_num}/{io_type}/{channel}/state
// Payload: "on" or "off"
//

// https://www.phidgets.com/?view=api
// https://www.npmjs.com/package/mqtt#client
//

// TODO
// Solve for late-joining and MQTT problems

const assert = require('assert');
const mqtt = require('mqtt')
const mqtt_regex = require("mqtt-regex");
const jPhidget22 = require('phidget22');

// SystemD Notify
// https://www.npmjs.com/package/sd-notify
const notify = require('sd-notify')

const config = require('./config')

var phidget_url = 'phid://' + config.phidget_server.host + ':' + config.phidget_server.port;
var mqtt_url = 'mqtt://' + config.mqtt.host + ":" + config.mqtt.port;

connected_phidget = false;
connected_mqtt = false;

// handle SIGINT for graceful restarts with
// process management daemons such as pm2
process.on('SIGINT', function() {
	console.log("received SIGINT; exiting")
	process.exit()
});

mqttc = mqtt.connect()

mqttc.on('connect', function () {
	console.log("[mqtt] connected to MQTT broker " + mqtt_url)
	connected_mqtt = true
	mqttc.subscribe(config.mqtt.topic_prefix + "/#")
})

mqttc.on('error', function (error) {
	console.log("[mqtt] error:", error)
})

mqttc.on('reconnect', function () {
	console.log("[mqttc] reconnecting")
})

// CONFIGURE DEVICES

// iterate boards from config
var device = []
console.info("configuring " + config.phidgets.length + " phidgets")
for (var i = 0; i < config.phidgets.length; i++ ) {

	d = config.phidgets[i].index
	device[d] = {}

	device[d].index = config.phidgets[i].index // todo; work with config designation
	device[d].model = config.phidgets[i].model
	device[d].serial = config.phidgets[i].serial

	if (device[d].model == "1012") {
		device[d].num_digital_outputs = 16
		device[d].num_digital_inputs = 16
	}

	// initialize DigitalOutput channels
	if (device[d].num_digital_outputs) device[d].digitalOutput = []
	for (var j=0; j<device[d].num_digital_outputs ; j++) {
		// device[i].digitalOutput[j] = new jPhidget22.DigitalOutput()
	}

	// Initialize DigitalInput channels
	if (device[d].num_digital_inputs) device[d].digitalInput = []
	for (var j=0; j<device[d].num_digital_inputs; j++) {
		device[d].digitalInput[j] = new jPhidget22.DigitalInput()
	}

	console.info("configured phidget " + device[d].model + " SN# " + device[d].serial + " as index # " + device[d].index)

}

var setPhidgetDigitalOutput = function(board, channel, state) {

	channel = parseInt(channel, 10)

	// temporary limit to channel 15
	if ((channel >= 16) || (!Number.isInteger(channel))) {
		console.error("requested channel " + channel + " but 15 is max!")
		return
	}

	board = parseInt(board, 10)
	state = state.toLowerCase()

	// 50 shades of truthiness

	switch (state) {

		case "1":
		state = true
		break

		case "on":
		state = true
		break

		case "true":
		state = true
		break

		case "0":
		state = false
		break

		case "off":
		state = false
		break

		case "false":
		state = false
		break

		default:
		state = true

	}


	device[board].digitalOutput[channel].setState(state)
	.then((value) => {
		console.info("setState("+board+"," + channel +") promise returned")
		// success setting state of output
		var topic = config.mqtt.topic_prefix + "/" + board.toString() + "/do/" + channel.toString() + "/state"
		var message = "OFF"
		if (state) message = "ON"
		mqttc.publish(topic, message, { retain : true, qos : 1 })
	}, function() {
		console.error('cannot set state')
	})

	console.info("setState("+ channel + ")=" + state + " called")

}

mqttc.on('message', function (topic, message) {

	// todo, ENQUEUE this incoming command if we are not
	// connected to the phidget
	if (connected_phidget) {

		// RECEIVED SET REQUEST
		var pattern = config.mqtt.topic_prefix + "/+board/do/+ch/set"
		var request = mqtt_regex(pattern).exec
		var params = request(topic)
		if (params) {
			var logMessage = 'processing request; board=' + params.board + ', channel=' + params.ch + ', state=' + message.toString()
			console.log(logMessage)
			setPhidgetDigitalOutput(params.board, params.ch, message.toString())
		}

	}

})

function configure() {

	connected_phidget = true
	console.info("[phidget] connected to PhidgetServer at " + phidget_url)

	// for device of devices
	for (dev of device) {

		// let channel = new jPhidget22.DigitalOutput();

		// Open All DigitalOutput
		if (dev.num_digital_outputs) {

			// dev.digitalOutput[i] = new jPhidget22.DigitalOutput()

			for (var i=0; i<dev.num_digital_outputs; i++) {

				dev.digitalOutput[i] = new jPhidget22.DigitalOutput();
				dev.digitalOutput[i].onAttach = function(ch) {
					console.info("[phidget] attached DigitalOutput channel # "+ ch.getChannel())
				}

				dev.digitalOutput[i].onDetach = function(ch) {
					console.info("[phidget] detached DigitalOutput channel # " + ch.getChannel())
				}

				dev.digitalOutput[i].onError = function(ch, description) {
					console.info("[phidget] channel error: " + ch + description)
				}

				dev.digitalOutput[i].setDeviceSerialNumber(dev.serial)
				dev.digitalOutput[i].setChannel(i)

				dev.digitalOutput[i].open(5000)
				.then(function (ch) {

				}).catch(function (err) {
					console.error('failed to open the channel:' + err)
				})
			}
		}

		// Open All DigitalInput
		if (dev.num_digital_inputs) {
			for (var i=0; i<dev.num_digital_inputs; i++) {

				// Attach - DigitalInput channel is attached and ready to use
				// read state and publish to MQTT topic
				dev.digitalInput[i].onAttach = function(ch) {
					console.info("[phidget] attached board #" +  dev.index + " DigitalInput channel # "+ ch.getChannel())
					var topic = config.mqtt.topic_prefix + "/" + dev.index + "/di/" + ch.getChannel() + "/state"
					var message = "0"
					if (dev.digitalInput[ch.getChannel()].getState()) message = "1"
					mqttc.publish(topic, message, { retain : true, qos : 1 })
				}

				// the onStateChange event does not pass the DigitalInput channel
				// and thus we must pass in the index number
				let ch_num = i
				let device_index = dev.index
				dev.digitalInput[i].onStateChange = function(state) {
					console.info("[phidget] Board # " + device_index + " DigitalInput # "+ ch_num + " is now " + state)
					var topic = config.mqtt.topic_prefix + "/" + device_index + "/di/" + ch_num + "/state"
					var message = "0"
					if (state) message = "1"
					mqttc.publish(topic, message, { retain : true, qos : 1 })
				}

				dev.digitalInput[i].onDetach = function(ch) {
					console.info("[phidget] detached DigitalInput channel # " + ch)
				}

				dev.digitalInput[i].onError = function(ch) {
					console.info("[phidget] channel error for ch " + ch)
				}

				dev.digitalInput[i].setDeviceSerialNumber(dev.serial)
				dev.digitalInput[i].setChannel(i)

				dev.digitalInput[i].open(5000, { isRemote : true })
				.then(function (ch) {

				}).catch(function (err) {
					console.error('failed to open the channel:' + err)
				})
			}
		}

	}

	// we are ready
	notify.ready()
	notify.startWatchdogMode(2800)

}

// PHIDGET CONNECTION

var phidgetConn = new jPhidget22.Connection(phidget_url, { name: 'Server Connection', passwd: '' });

phidgetConn.onError = function(code, msg) {
	var eMsg = "[phidget] error: " + code + "; " + msg
	console.error(eMsg)
	process.exit(1)
}

phidgetConn.onDisconnect = function() {
	console.error("[phidget] disconnected")
	connected_phidget = false
	process.exit(1);
}

phidgetConn.connect()
.then(configure)
.catch(function (err) {
	console.log('Error running example:' + err);
	process.exit(1);
});
