'use strict';

/**
 * utils/fileUtils.js
 * Helpers for temp-directory management, file-size formatting,
 * and safe cleanup of temporary files.
 */

const fs     = require('fs-extra');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('./logger');

/**
 * Ensure the temp directory exists. Called once at startup.
 */
async function ensureTempDir() {
  await fs.ensureDir(config.tempDir);
  logger.info(`Temp directory ready: ${path.resolve(config.tempDir)}`);
}

/**
 * Generate a unique file path inside the temp directory.
 * @param {string} extension - e.g. 'mp3', 'm4a'
 * @returns {string} absolute path
 */
function getTempFilePath(extension) {
  const filename = `${uuidv4()}.${extension}`;
  return path.resolve(config.tempDir, filename);
}

/**
 * Delete one or more files silently (ignores errors so a missing file
 * doesn't crash the cleanup step).
 * @param {...string} filePaths
 */
async function cleanupFiles(...filePaths) {
  for (const filePath of filePaths) {
    if (!filePath) continue;
    try {
      await fs.remove(filePath);
      logger.debug(`Deleted temp file: ${filePath}`);
    } catch (err) {
      logger.warn(`Could not delete temp file ${filePath}: ${err.message}`);
    }
  }
}

/**
 * Format a byte count into a human-readable string (KB / MB).
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Extract the lowercase extension from a filename (without the dot).
 * Falls back to empty string if no extension found.
 * @param {string} filename
 * @returns {string}
 */
function getFileExtension(filename) {
  if (!filename) return '';
  const ext = path.extname(filename).replace('.', '').toLowerCase();
  return ext;
}

module.exports = {
  ensureTempDir,
  getTempFilePath,
  cleanupFiles,
  formatFileSize,
  getFileExtension,
};
