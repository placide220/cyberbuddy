const winston = require("winston");
const path    = require("path");
const fs      = require("fs");

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, "error.log"),   level: "error", maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join(logsDir, "combined.log"),               maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const extra = Object.keys(meta).length ? " "+JSON.stringify(meta) : "";
          return `${timestamp} [${level}] ${message}${extra}`;
        })
      )
    })
  ]
});

module.exports = logger;
