---
title: Audio Bot
emoji: 🎵
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# 🎵 Telegram Audio Converter Bot

A production-ready Telegram bot built with Node.js that effortlessly converts audio files (like M4A, OGG, WAV, etc.) into MP3, WAV, or OGG formats using FFmpeg.

## ✨ Features

- **Format Selection**: Intuitive inline keyboard allowing users to choose their desired output format.
- **Widespread Format Support**: Accepts `.mp3`, `.m4a`, `.ogg`, `.wav`, `.flac`, `.aac`, `.opus`, and even extracts audio from `.mp4` video messages.
- **Memory Efficient**: Processes streams through `axios` directly to disk and cleans up securely to avoid storage bloat on your server.
- **Real-time processing updates**: Changes message text to let users know the status (`Downloading -> Processing -> Uploading`).
- **Flexible Deployment**: Supports both Polling mode (local dev/simple VPS) and Webhook mode (scalables like Railway).

## 📋 Prerequisites

Before you start, ensure you have the following installed on your machine or server:

1. **Node.js** (v18.x or higher)
2. **FFmpeg** installed and accessible in your system's PATH.
   - **Windows**: Download from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) or install via `winget install ffmpeg`
   - **Ubuntu/Debian**: `sudo apt install ffmpeg`
   - **MacOS**: `brew install ffmpeg`

## 🛠️ Installation & Setup

1. **Clone or Extract the folder** and navigate to it:
   ```bash
   cd bot
   ```

2. **Install node dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and set up your bot details (Talk to [@BotFather](https://t.me/BotFather) on Telegram to get your token).

   **Example `.env`**:
   ```ini
   BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ
   MAX_FILE_SIZE_MB=50
   TEMP_DIR=./temp
   BOT_MODE=polling # use polling locally
   MP3_QUALITY=2 # 0-9 (0 = best, 9 = worst file size)
   ```

4. **Start the Bot (Development)**:
   ```bash
   npm run dev
   ```

5. **Start the Bot (Production)**:
   ```bash
   npm start
   ```

---

## 🚀 Deployment Guide

### Option 1: Railway (Easiest Cloud Provider)

Railway is excellent for background worker bots because it natively handles Docker and Node.js without timing out like Serverless edge functions.

1. Create a GitHub repo and push this code.
2. Log into [Railway.app](https://railway.app/).
3. Click **New Project** -> **Deploy from GitHub repo**.
4. Important: Add the `ffmpeg` apt package. Add a file named `Aptfile` to the root of your project containing just the word:
   ```text
   ffmpeg
   ```
   *Railway uses Nixpacks which will automatically install ffmpeg if it sees an Aptfile.*
5. In Railway Variables, add your `BOT_TOKEN`.
6. Done! The bot will run 24/7.

### Option 2: VPS (DigitalOcean / Hetzner / AWS EC2)

1. SSH into your VPS and install Node.js + FFmpeg.
   ```bash
   sudo apt update
   sudo apt install nodejs npm ffmpeg -y
   ```
2. Clone the repo and `npm install`.
3. Create your `.env` file with `BOT_MODE=polling`.
4. Run the bot persistently using **PM2**:
   ```bash
   sudo npm install -g pm2
   pm2 start npm --name "audio-bot" -- run start
   pm2 startup
   pm2 save
   ```

### Option 3: Vercel (Serverless)
*Note: Telegram bots heavily relying on FFmpeg and large file uploads are **not recommended** for Vercel due to the 50MB Serverless Function payload limit and maximum execution timeouts (10 seconds on the free tier).* 

If you must run it serverless, you have to transition this code exclusively to `webhook` mode and point Vercel's endpoints to `/api/webhook` passing the `req.body` into `bot.processUpdate(req.body)`, but you will encounter timeout drops on larger file conversions. Please use a worker instance like Railway or Render instead!

---

## 📂 Project Architecture

```
📦 bot
 ┣ 📂 src
 ┃ ┣ 📂 bot
 ┃ ┃ ┗ 📜 handlers.js           # Handles /start, messages, and inline keyboards
 ┃ ┣ 📂 conversion
 ┃ ┃ ┗ 📜 audioConverter.js     # fluent-ffmpeg wrapper and file stream processing
 ┃ ┣ 📂 state
 ┃ ┃ ┗ 📜 sessions.js           # In-memory store linking callbacks to FileIDs
 ┃ ┣ 📂 utils
 ┃ ┃ ┣ 📜 fileUtils.js          # Temp dir management and cleanup safely
 ┃ ┃ ┗ 📜 logger.js             # Structured console logging
 ┃ ┣ 📜 config.js               # Centralised env validator
 ┃ ┗ 📜 index.js                # App entrypoint (initializes webhook/polling)
 ┣ 📜 .env.example
 ┣ 📜 package.json
 ┗ 📜 README.md
```
