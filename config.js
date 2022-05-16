const config = {
    mqtt: {
        host : "127.0.0.1",
        port : 1883,
        topic_prefix : "phidget"
    },
    phidget_server: {
        host : "127.0.0.1",
        port : 5661       
    },
    phidgets: [
        {
            index : 0,
            serial : 515667,
            model : 1012
        },
        {
            index : 1,
            serial : 537133,
            model : 1012
        }
    ]
}

module.exports = config;