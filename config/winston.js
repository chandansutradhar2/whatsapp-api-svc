const winston = require('winston');
// creates a new Winston Logger


// define the custom settings for each transport (file, console)
var options = {
    file: {
      level: 'info',
      filename: `./logs/error.log`,
      handleExceptions: true,
      json: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      colorize: false,
    },
    console: {
      level: 'debug',
      handleExceptions: true,
      json: false,
      colorize: true,
    },
  };


const logger = new winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.File(options.file),
        new winston.transports.Console(options.console)
    ],
    exitOnError: false
});
module.exports = logger;