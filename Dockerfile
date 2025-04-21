FROM node:18-alpine

# Install git
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application code
COPY . .

# Expose API port
EXPOSE 3000

# Command to run the server
CMD ["node", "server.js"]