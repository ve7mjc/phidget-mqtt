module.exports = {
    apps : [{
        name       : 'phidget-mqtt',
        script     : '/opt/phidget-mqtt/app.js',
        watch      : '*.js',
        error_file : 'err.log',
        out_file   : 'out.log',
        merge_logs : true,
        "log_date_format" : "YYYY-MM-DD HH:mm",
        env: {
            NODE_ENV: 'development'
        },
        env_production : {
            NODE_ENV: 'production'
        }
    }],
};
