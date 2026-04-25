'use strict';

/**
 * state/sessions.js
 * In-memory map to track pending user conversions.
 * Because Telegram callback_data is limited to 64 bytes, we store
 * the actual file IDs and metadata here.
 */

// Key: messageId (the ID of the message containing the conversion buttons)
// Value: { senderId: string, messageId: number, fileName: string, originalExt: string, status: string }
const sessions = new Map();

module.exports = sessions;
