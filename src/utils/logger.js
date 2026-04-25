'use strict';

/**
 * utils/logger.js
 * Lightweight structured logger with timestamps and log-levels.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const ICONS   = { debug: '🔍', info: 'ℹ️ ', warn: '⚠️ ', error: '❌' };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log(level, ...args) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const ts  = new Date().toISOString();
  const icon = ICONS[level];
  console[level === 'error' ? 'error' : 'log'](`[${ts}] ${icon} [${level.toUpperCase()}]`, ...args);
}

module.exports = {
  debug : (...a) => log('debug', ...a),
  info  : (...a) => log('info',  ...a),
  warn  : (...a) => log('warn',  ...a),
  error : (...a) => log('error', ...a),
};
