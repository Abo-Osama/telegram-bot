'use strict';

/**
 * src/index.js
 * Main entry point for the Telegram Audio Converter Bot (GramJS version).
 * Handles initialization of the MTProto client and registers handlers.
*/

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs-extra');
const http = require('http');
const https = require('https');
const config = require('./config');
const logger = require('./utils/logger');
const fileUtils = require('./utils/fileUtils');
const registerHandlers = require('./bot/handlers');

async function bootstrap() {
  logger.info('==========================================');
  logger.info('   Telegram Audio Converter Bot (MTProto)   ');
  logger.info('==========================================');

  // 1. Ensure temporary directories are present
  await fileUtils.ensureTempDir();

  // 2. Initialize the GramJS Client with Persistent Session
  const sessionFile = './session.txt';
  let sessionString = "";

  if (await fs.pathExists(sessionFile)) {
    sessionString = await fs.readFile(sessionFile, 'utf8');
    logger.info('🔑 Loading session from session.txt');
  }

  const stringSession = new StringSession(sessionString);
  
  const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
    connectionRetries: 200,
    retryDelay: 2000,
    autoReconnect: true,
    sleepThreshold: 120,
    timeout: 60,
    requestRetries: 5,
    dcId: 2,
    useWSS: false,
    testServers: false,
    proxy: null
  });

  logger.info('📡 Connecting to Telegram...');
  
  try {
    await client.start({
      botAuthToken: config.botToken,
      floodSleepThreshold: 60, // Automatically wait for floods up to 60s
    });

    // Save the session string for future restarts
    const newSessionString = client.session.save();
    if (newSessionString !== sessionString) {
        await fs.writeFile(sessionFile, newSessionString, 'utf8');
        logger.info('💾 Session saved to session.txt');
    }

  } catch (err) {
    if (err.errorMessage === 'FLOOD') {
        logger.error(`⚠️ Telegram FloodWait: You must wait ${err.seconds} seconds before starting the bot again.`);
        process.exit(1);
    }
    if (err.errorMessage === 'AUTH_KEY_DUPLICATED') {
        logger.error('⚠️ AUTH_KEY_DUPLICATED - Session file is corrupted or in use by another instance.');
        logger.info('🗑️ Deleting session.txt and restarting...');
        await fs.remove(sessionFile);
        process.exit(1);
    }
    throw err;
  }

  logger.info('✅ Bot is connected and authenticated.');

  // Verify bot identity
  const me = await client.getMe();
  logger.info(`🤖 Bot identity: ${me.firstName} (@${me.username}) id=${me.id}`);

  // Save the session if needed (optional for bots)
  // logger.debug(`Session: ${client.session.save()}`);

  // 3. Register all command and event handlers
  registerHandlers(client);

  // Debug: log ALL incoming events
  client.addEventHandler((event) => {
    const msg = event.message;
    if (msg) {
      logger.info(`[RAW] chatId=${msg.chatId} senderId=${msg.senderId} text=${(msg.message || '').slice(0, 50)} hasMedia=${!!msg.media}`);
    }
  });

  logger.info('🚀 Bot is ready to receive messages.');

  // 4. Start Health Check Server for Hugging Face Spaces
  const port = process.env.PORT || 7860;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running and healthy!\n');
  });
  server.listen(port, () => {
    logger.info(`🔌 Health check server listening on port ${port}`);
  });

  // 4b. Self-ping to prevent Hugging Face Space from sleeping
  const spaceUrl = config.spaceUrl;
  if (spaceUrl) {
    const pingUrl = spaceUrl.startsWith('http') ? spaceUrl : `https://${spaceUrl}`;
    logger.info(`🏓 Self-ping enabled for: ${pingUrl}`);
    
    const selfPing = () => {
      const url = new URL(pingUrl);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          logger.info(`🏓 Self-ping successful (${res.statusCode})`);
        });
      });
      req.on('error', (err) => {
        logger.warn(`🏓 Self-ping failed: ${err.message}`);
      });
      req.setTimeout(10000, () => {
        req.destroy();
        logger.warn('🏓 Self-ping timeout');
      });
    }; 
    
    setInterval(selfPing, 4 * 60 * 1000);
    setTimeout(selfPing, 30000); 
  } else {
    logger.warn('⚠️ No SPACE_URL/SPACE_HOST env var - self-ping disabled. Space may sleep on free tier.');
  }

  // 5. Enhanced Connection Management
  let isReconnecting = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 20;
  let lastActivity = Date.now();
  
  // Keep-alive mechanism
  const keepAlive = async () => {
    try {
      if (client.connected) {
        // Send a lightweight request to keep connection alive
        await client.invoke(new Api.updates.GetState());
        lastActivity = Date.now();
      }
    } catch (err) {
      logger.warn(`Keep-alive failed: ${err.message}`);
    }
  };
  
  // Send keep-alive every 25 seconds
  setInterval(keepAlive, 25000);
  
  const monitorConnection = async () => {
    if (isReconnecting) return;
    
    try {
      const timeSinceLastActivity = Date.now() - lastActivity;
      
      // Check if connection is stale or disconnected
      if (!client.connected || timeSinceLastActivity > 60000) {
        logger.warn('Connection lost or stale, attempting to reconnect...');
        isReconnecting = true;
        reconnectAttempts++;
        
        if (reconnectAttempts > maxReconnectAttempts) {
          logger.error('Max reconnection attempts reached, restarting...');
          process.exit(1);
        }
        
        try {
          await client.connect();
          logger.info('Reconnection successful');
          reconnectAttempts = 0;
          lastActivity = Date.now();
        } catch (err) {
          logger.error(`Reconnection failed: ${err.message}`);
          setTimeout(monitorConnection, 5000);
        }
      }
    } catch (err) {
      logger.error(`Connection monitoring error: ${err.message}`);
    } finally {
      isReconnecting = false;
    }
  };
  
  // Monitor connection every 15 seconds
  setInterval(monitorConnection, 15000);
  
  // Handle connection events
  client.addEventHandler((event) => {
    if (event.className === 'UpdateConnectionState') {
      logger.info(`Connection state changed: ${event.state}`);
      if (event.state === 'Connected') {
        lastActivity = Date.now();
        reconnectAttempts = 0;
      }
    }
  });
  
  // Update last activity on any successful operation
  const originalInvoke = client.invoke.bind(client);
  client.invoke = async function(...args) {
    try {
      const result = await originalInvoke(...args);
      lastActivity = Date.now();
      return result;
    } catch (err) {
      throw err;
    }
  };

  // 6. Graceful Shutdown (resist HF SIGTERM to stay alive)
  let shutdownRequested = false;
  
  const shutdown = async (signal) => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    logger.warn(`Received ${signal}, attempting to stay alive...`);
    
    // On Hugging Face, SIGTERM often means the space is being idled.
    // Try to reconnect and keep running instead of exiting.
    try {
      if (!client.connected) {
        logger.info('Attempting to reconnect after SIGTERM...');
        await client.connect();
        logger.info('Reconnected after SIGTERM!');
        shutdownRequested = false;
        return;
      }
    } catch (err) {
      logger.error(`Reconnect after SIGTERM failed: ${err.message}`);
    }
    
    // If reconnect didn't work, exit and let processManager restart
    try {
      await client.disconnect();
    } catch (err) {
      logger.error(`Error during disconnect: ${err.message}`);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Start application
bootstrap().catch((err) => {
  logger.error(`Failed to start bot: ${err.message}`);
  console.error(err);
  process.exit(1);
});
