'use strict';

/**
 * config.js
 * Centralised configuration loaded from environment variables.
 * All other modules import from here — never call process.env directly.
 */

require('dotenv').config();

const config = {
  // ── Telegram ────────────────────────────────────────────────
  botToken: process.env.BOT_TOKEN,
  apiId: parseInt(process.env.TELEGRAM_API_ID || '0', 10),
  apiHash: process.env.TELEGRAM_API_HASH,

  // ── File handling ────────────────────────────────────────────
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '2000', 10), // MTProto supports up to 2GB
  tempDir: process.env.TEMP_DIR || './temp',

  // ── Bot mode ─────────────────────────────────────────────────
  botMode: (process.env.BOT_MODE || 'polling').toLowerCase(),
  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookPort: parseInt(process.env.WEBHOOK_PORT || '3000', 10),

  // ── Hugging Face Spaces ──────────────────────────────────────
  spaceUrl: process.env.SPACE_URL || process.env.SPACE_HOST || '',

  // ── Conversion quality ───────────────────────────────────────
  mp3Quality: parseInt(process.env.MP3_QUALITY || '5', 10),
  audioBitrate: process.env.AUDIO_BITRATE || '96k',

  // ── Supported formats ─────────────────────────────────────────
  supportedInputFormats: ['mp3', 'm4a', 'ogg', 'wav', 'flac', 'aac', 'wma', 'opus', 'mp4', 'webm', 'mkv', 'avi', 'mov'],
  outputFormats: ['mp3', 'wav', 'ogg'],
};

// Validate critical fields at startup
if (!config.botToken || !config.apiId || !config.apiHash) {
  console.error('[Config] ❌  BOT_TOKEN, TELEGRAM_API_ID, and TELEGRAM_API_HASH must be set in your .env file.');
  process.exit(1);
}

if (config.botMode === 'webhook') {
  console.warn('[Config] ⚠️  GramJS primarily uses polling. Webhook mode may require additional implementation.');
}

module.exports = config;
