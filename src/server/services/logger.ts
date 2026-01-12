/*
 * Copyright (C) 2025 Christin Löhner
 */

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { resolve } from "path";
import { mkdirSync, existsSync } from "fs";

const LOG_DIR = resolve(process.cwd(), "logs");
const LOG_LEVEL = process.env.LOG_LEVEL || "info"; // debug, info, warn, error
const ENABLE_CONSOLE = process.env.LOG_CONSOLE !== "false";

let logDirReady = true;

// Ensure logs directory exists (but never crash the app if it fails)
try {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (error) {
  logDirReady = false;
  console.warn("[Logger] Failed to initialize log directory, falling back to console only.", {
    logDir: LOG_DIR,
    error: error instanceof Error ? { message: error.message, name: error.name } : error
  });
}

// Custom format for better readability
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

const fileTransports: winston.transport[] = [];
if (logDirReady) {
  try {
    // Rotating file transport for all logs
    fileTransports.push(new DailyRotateFile({
      filename: resolve(LOG_DIR, "xynoxa-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d", // Keep logs for 14 days
      level: LOG_LEVEL,
      format: logFormat
    }));

    // Rotating file transport for errors only
    fileTransports.push(new DailyRotateFile({
      filename: resolve(LOG_DIR, "xynoxa-error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d", // Keep error logs longer
      level: "error",
      format: logFormat
    }));
  } catch (error) {
    logDirReady = false;
    console.warn("[Logger] Failed to attach file transports, falling back to console only.", {
      logDir: LOG_DIR,
      error: error instanceof Error ? { message: error.message, name: error.name } : error
    });
  }
}

// Console transport (enabled by default, can be disabled via LOG_CONSOLE=false)
const consoleTransport = new winston.transports.Console({
  level: LOG_LEVEL,
  format: consoleFormat
});

// Create logger instance
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: logFormat,
  defaultMeta: { service: "xynoxa-cloud" },
  transports: [
    ...fileTransports,
    ...(ENABLE_CONSOLE ? [consoleTransport] : [])
  ],
  exitOnError: false
});

let globalHandlersRegistered = false;

export function registerGlobalErrorHandlers() {
  if (globalHandlersRegistered) return;
  globalHandlersRegistered = true;

  process.on("uncaughtException", (error) => {
    logError("[Process] Uncaught exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    logError("[Process] Unhandled rejection", reason);
  });

  process.on("warning", (warning) => {
    logWarn("[Process] Warning", {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });

  if (logDirReady) {
    try {
      // Handle uncaught exceptions
      logger.exceptions.handle(
        new DailyRotateFile({
          filename: resolve(LOG_DIR, "exceptions-%DATE%.log"),
          datePattern: "YYYY-MM-DD",
          maxSize: "20m",
          maxFiles: "30d"
        })
      );

      // Handle unhandled promise rejections
      logger.rejections.handle(
        new DailyRotateFile({
          filename: resolve(LOG_DIR, "rejections-%DATE%.log"),
          datePattern: "YYYY-MM-DD",
          maxSize: "20m",
          maxFiles: "30d"
        })
      );
    } catch (error) {
      console.warn("[Logger] Failed to attach exception/rejection handlers.", {
        logDir: LOG_DIR,
        error: error instanceof Error ? { message: error.message, name: error.name } : error
      });
    }
  }
}

// Convenience methods with context
export function logInfo(message: string, meta?: any) {
  logger.info(message, meta);
}

export function logError(message: string, error?: any, meta?: any) {
  if (error instanceof Error) {
    logger.error(message, {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      ...meta
    });
  } else {
    logger.error(message, { error, ...meta });
  }
}

export function logWarn(message: string, meta?: any) {
  logger.warn(message, meta);
}

export function logDebug(message: string, meta?: any) {
  logger.debug(message, meta);
}

// API Request Logger
export function logRequest(method: string, url: string, userId?: string, statusCode?: number, duration?: number, error?: any) {
  const meta: any = {
    method,
    url,
    userId,
    statusCode,
    duration: duration ? `${duration}ms` : undefined
  };

  if (error) {
    logError(`API Request Failed: ${method} ${url}`, error, meta);
  } else if (statusCode && statusCode >= 400) {
    logWarn(`API Request Warning: ${method} ${url}`, meta);
  } else {
    logInfo(`API Request: ${method} ${url}`, meta);
  }
}

// Upload Logger
export function logUpload(userId: string, filename: string, size: number, success: boolean, error?: any) {
  const meta = { userId, filename, size: `${(size / 1024 / 1024).toFixed(2)} MB` };
  if (success) {
    logInfo("File uploaded successfully", meta);
  } else {
    logError("File upload failed", error, meta);
  }
}

// Sync Logger
export function logSync(userId: string, action: string, details?: any) {
  logInfo(`Sync: ${action}`, { userId, ...details });
}

export default logger;
