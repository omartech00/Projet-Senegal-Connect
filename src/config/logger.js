const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, json, errors } = format;

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return stack
      ? `${ts} [${level}]: ${message}\n${stack}`
      : `${ts} [${level}]: ${message}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const silentFormat = format(() => false)();

const logger = createLogger({
  level: LOG_LEVEL,
  format: NODE_ENV === 'production' ? prodFormat : NODE_ENV === 'test' ? silentFormat : devFormat,
  transports: [],
});

if (NODE_ENV === 'production') {
  const logsDir = path.join(__dirname, '../../logs');
  logger.add(new transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }));
  logger.add(new transports.File({ filename: path.join(logsDir, 'combined.log') }));
} else if (NODE_ENV === 'test') {
  logger.add(new transports.Console({ format: silentFormat }));
} else {
  logger.add(new transports.Console());
}

module.exports = logger;
