'use strict';

/**
 * src/processManager.js
 * Process manager to handle automatic restarts and crash recovery
 */

const { spawn } = require('child_process');
const logger = require('./utils/logger');

class ProcessManager {
  constructor() {
    this.process = null;
    this.restartTime = 5000; // 5 seconds
    this.maxRestarts = 10;
    this.restartCount = 0;
    this.isShuttingDown = false;
  }

  start() {
    logger.info('🚀 Starting Telegram Bot Process Manager...');
    this.startBot();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
  }

  startBot() {
    if (this.isShuttingDown) return;

    logger.info(`🔄 Starting bot (restart #${this.restartCount})`);
    
    this.process = spawn('node', ['src/index.js'], {
      stdio: 'inherit',
      env: process.env
    });

    this.process.on('close', (code) => {
      logger.warn(`Bot process exited with code: ${code}`);
      
      if (!this.isShuttingDown) {
        this.restartCount++;
        
        if (this.restartCount >= this.maxRestarts) {
          logger.error(`Maximum restarts (${this.maxRestarts}) reached. Giving up.`);
          process.exit(1);
        }
        
        logger.info(`Restarting bot in ${this.restartTime / 1000} seconds...`);
        setTimeout(() => this.startBot(), this.restartTime);
      }
    });

    this.process.on('error', (err) => {
      logger.error(`Failed to start bot process: ${err.message}`);
    });
  }

  shutdown(signal) {
    logger.info(`Received ${signal}, shutting down process manager...`);
    this.isShuttingDown = true;
    
    if (this.process) {
      logger.info('Terminating bot process...');
      this.process.kill('SIGTERM');
      
      // Force kill if it doesn't terminate gracefully
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          logger.warn('Force killing bot process...');
          this.process.kill('SIGKILL');
        }
        process.exit(0);
      }, 5000);
    } else {
      process.exit(0);
    }
  }
}

// Start the process manager
if (require.main === module) {
  const manager = new ProcessManager();
  manager.start();
}

module.exports = ProcessManager;
