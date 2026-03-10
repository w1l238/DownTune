# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Install Python, pip, ffmpeg, curl, and unzip
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg curl unzip

# Install Deno (for yt-dlp JS runtime)
RUN curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -o deno.zip \
    && unzip deno.zip \
    && mv deno /usr/local/bin/deno \
    && chmod +x /usr/local/bin/deno \
    && rm deno.zip

# Install/update yt-dlp
RUN pip3 install -U yt-dlp --break-system-packages

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install any needed packages
RUN npm install

# Bundle app source
COPY . .

# Make port 3001 available to the world outside this container
EXPOSE 3001

# Define the command to run the app
CMD [ "node", "index.js" ]
