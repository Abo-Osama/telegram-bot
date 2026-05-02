'use strict';

/**
 * conversion/audioConverter.js
 * Wrapper around fluent-ffmpeg to handle actual audio formatting.
 */

const ffmpeg = require('fluent-ffmpeg');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Converts an audio file to the target format.
 * @param {string} inputPath - Absolute path to the source file
 * @param {string} outputPath - Absolute path where the converted file should go
 * @param {string} targetFormat - Output extension (e.g. 'mp3', 'wav', 'ogg')
 * @param {string|null} coverPath - Absolute path to the cover image if available
 * @param {string|null} authorName - String denoting the author name to add as ID3 tag
 * @param {string|null} titleName - String denoting the title to add as ID3 tag
 * @returns {Promise<string>} outputPath on success
 */
function convertAudio(inputPath, outputPath, targetFormat, coverPath = null, authorName = null, titleName = null) {
  return new Promise((resolve, reject) => {
    logger.debug(`Starting conversion: ${inputPath} -> ${outputPath} (Format: ${targetFormat})`);

    const command = ffmpeg();
    command.input(inputPath);

    if (coverPath) {
      command.input(coverPath);
    }

    command
      .toFormat(targetFormat)
      .addOption('-threads', '0') // Use all available CPU cores
      .addOption('-loglevel', 'error'); // Keep logs clean
    
    // Apply compression
    if (config.audioBitrate) {
      command.audioBitrate(config.audioBitrate);
    }

    // Apply specific codec/quality settings based on format
    if (targetFormat === 'mp3') {
      command.audioCodec('libmp3lame').audioQuality(config.mp3Quality);
      
      // Always use id3v2_version 3 for better Unicode support in MP3 metadata
      command.outputOptions('-id3v2_version', '3');

      if (coverPath) {
        command.outputOptions('-map', '0:a?', '-map', '1:v?', '-c:v', 'mjpeg', '-metadata:s:v', 'title=Cover', '-metadata:s:v', 'comment=Cover', '-disposition:v', 'attached_pic');
      } else {
        command.outputOptions('-vn');
      }
    } else if (targetFormat === 'ogg') {
      command.audioCodec('libopus');
    }

    if (authorName && authorName.trim()) {
      // Use double quotes around the value to handle spaces and Unicode on Windows
      command.outputOptions('-metadata', `artist="${authorName.trim()}"`);
    }

    if (titleName && titleName.trim()) {
      command.outputOptions('-metadata', `title="${titleName.trim()}"`);
    }


    command
      .on('start', (cmdLine) => {
        logger.debug(`Spawned ffmpeg with command: ${cmdLine}`);
      })
      .on('end', () => {
        logger.info(`Conversion successful: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        logger.error(`Conversion failed: ${err.message}`);
        logger.error(`ffmpeg stderr: ${stderr}`);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Get the duration of an audio file in seconds.
 * @param {string} filePath - Path to the file
 * @returns {Promise<number>} duration in seconds
 */
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      resolve(Math.floor(duration || 0));
    });
  });
}

module.exports = {
  convertAudio,
  getAudioDuration,
};
