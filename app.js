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

// TODO
// Solve for late-joining and MQTT problems

const assert = require('assert');
const mqtt = require('mqtt')
const mqtt_regex = require("mqtt-regex");
const jPhidget22 = require('phidget22');

const MQTT_HOST = "127.0.0.1"
const MQTT_TOPIC_PREFIX = "phidget"
const PHIDGET_SERVER_PORT = 5661;
const PHIDGET_SERVER_HOST = "127.0.0.1"

// handle SIGINT for graceful restarts with 
// process management daemons such as pm2
process.on('SIGINT', function() {
    console.log("received SIGINT; exiting")
    process.exit()
});

const mqttc = mqtt.connect('mqtt://' + MQTT_HOST)

mqttc.on('connect', function () {
	console.log("[mqtt] connected to MQTT broker")
	mqttc.subscribe(MQTT_TOPIC_PREFIX + "/#")
})

mqttc.on('error', function (error) {
	console.log("[mqtt] error:", error)
})

mqttc.on('reconnect', function () {
	console.log("[mqttc] reconnecting")
})

var device = [{
	serial : 515667,
	model : 1012,
	digitalOutput : [],
	digitalInput : []
}]

for (var i = 0; i < 16; i++ ) {
	device[0].digitalOutput[i] = new jPhidget22.DigitalOutput()
}

var setPhidgetDigitalOutput = function(board, channel, state) {
  
    channel = parseInt(channel, 10)
    board = parseInt(board, 10)

    // 50 shades of truthiness
    // TRUE
    if (state == "1") state = true
    if (state == "on") state = true
    if (state == "true") state = true

    // FALSE
    if (state == "0") state = false
    if (state == "off") state = false
    if (state == "false") state = false
    
	device[board].digitalOutput[channel].setState(state)
		.then((value) => {
			console.info("setState("+board+"," + channel +") promise returned")
            // success setting state of output
            var topic = MQTT_TOPIC_PREFIX + "/" + board.toString() + "/do/" + channel.toString() + "/state"
            var message = "off"
            if (state) message = "on"
            mqttc.publish(topic, message, { retain : true, qos : 1 })
		}, function() {
			console.error('cannot set state' + errorCode())
		})
		
	console.info("setState("+ channel + ") called")
    
}

mqttc.on('message', function (topic, message) {

    // RECEIVED SET REQUEST
    var pattern = MQTT_TOPIC_PREFIX + "/+board/do/+ch/set"
    var request = mqtt_regex(pattern).exec
    var params = request(topic)
    if (params) {
        var logMessage = 'processing request; board=' + params.board + ', channel=' + params.ch + ', state=' + message.toString()
        console.log(logMessage)
        setPhidgetDigitalOutput(params.board, params.ch, message.toString())
    }

})

var url = 'phid://' + PHIDGET_SERVER_HOST + ':' + PHIDGET_SERVER_PORT;

console.info('[phidget] connecting to ' + url);
var phidgetConn = new jPhidget22.Connection(url, { name: 'Server Connection', passwd: '' });

phidgetConn.onDisconnect = function() {
	console.error("[phidget] disconnected")
}

phidgetConn.onConnect = function() {
	
	console.info("[phidget] connected")
	
	for (var i = 0; i < 16; i++ ) {
		
	    device[0].digitalOutput[i].onAttach = function(ch) { 
			console.info("[phidget] attached channel "+ ch.getChannel())
	    }
	    
	    device[0].digitalOutput[i].onDetach = function(ch) { 
			console.info("[phidget] detached channel " + ch.getChannel())
	    }
	    
	    device[0].digitalOutput[i].onError = function(ch) {
			console.info("[phidget] channel error for ch " + ch.getChannel())
	    }
	    
	    device[0].digitalOutput[i].setChannel(i)
	    device[0].digitalOutput[i].setDeviceSerialNumber(device[0].serial)
	    device[0].digitalOutput[i].open(2000, { isRemote : true })
	    	.then(function (ch) {

		    }).catch(function (err) {
		        console.error('failed to open the channel:' + err)
		    })
		    
		// digitalInputs[i] = new jPhidget22.DigitalInput()
	}
	
}

phidgetConn.onError = function(code, msg) {
	var eMsg = "[phidget] error connecting: " + code + "; " + msg
	console.error(eMsg)
	process.exit(1)
}

phidgetConn.connect()

