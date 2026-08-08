# Use an official Node.js runtime as a parent image
FROM node:24.19.0-bookworm-slim

# Install Python, pip, and ffmpeg; clean up apt cache to keep image lean
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --no-cache-dir yt-dlp==2026.7.4 --break-system-packages

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install any needed packages
RUN npm ci --omit=dev

# Bundle app source
COPY . .

# Make port 3001 available to the world outside this container
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Define the command to run the app
CMD [ "node", "index.js" ]
