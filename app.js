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

    // HARDCODED Serial Number mapping!
    var deviceSerialNumber
    if (board == 0) deviceSerialNumber = 515667
    
    var ch = new jPhidget22.DigitalOutput()
    
    ch.onAttach = function(ch) { 
        
        ch.setState(state).then( function() {
            // success setting state of output
            var topic = MQTT_TOPIC_PREFIX + "/" + board.toString() + "/do/" + channel.toString() + "/state"
            var message = "off"
            if (state) message = "on"
            mqttc.publish(topic, message, { retain : true, qos : 1 })
        }).catch( function (err) {
            console.error("error setState()", err)
        })

        ch.close()
    }
    
    // Channel and DeviceSerialNumber must be 
    // set prior to opening channel
    ch.setChannel(channel)
    ch.setDeviceSerialNumber(deviceSerialNumber)
    ch.open().then(function (ch) {

    }).catch(function (err) {
        console.error('failed to open the channel:' + err);
    })
    
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

console.info('connecting to ' + url);
var conn = new jPhidget22.Connection(url, { name: 'Server Connection', passwd: '' });
conn.connect()
    .then()
    .catch(function (err) {
        console.error(err);
        process.exit(1);
    });
