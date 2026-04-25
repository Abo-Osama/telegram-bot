FROM node:18-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm install --production

# Copy app files
COPY . .

# Run the app with process manager for auto-restart
CMD ["node", "src/processManager.js"]
