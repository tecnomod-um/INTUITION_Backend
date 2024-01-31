const winston = require('winston');
require('winston-daily-rotate-file');

const fileTransportOptions = {
    filename: 'logs/application-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d'
};

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => {
            return `${info.timestamp} [${info.level}]: ${info.message}`;
        })
    ),
    transports: [
        new winston.transports.DailyRotateFile({
            ...fileTransportOptions,
            level: 'error',
            filename: 'logs/error-%DATE%.log'
        }),
        new winston.transports.DailyRotateFile(fileTransportOptions)
    ]
});

logger.add(new winston.transports.File({
    filename: 'logs/uncaughtExceptions.log',
    handleExceptions: true,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.prettyPrint()
    )
}));

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

module.exports = logger;
