// server.js - Main API server with named subfolder routing and Redis persistence
const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const bodyParser = require('body-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Redis = require('ioredis');
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_MCP_PORT = 10000;

// Redis client setup with Docker Compose connection
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 5,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  keyPrefix: 'mcp-manager:'
});

// In-memory tracking of running processes
const mcpServers = {};
let nextAvailablePort = BASE_MCP_PORT;

// Serve static files
app.use(express.static('public'));

// Parse JSON requests
app.use(bodyParser.json());

// Redis connection handling
redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Initialize from Redis on startup
async function initializeFromRedis() {
  try {
    // Load stored port counter
    const storedPort = await redisClient.get('next_port');
    if (storedPort) {
      nextAvailablePort = parseInt(storedPort, 10);
    }
    
    // Load stored servers
    const serverKeys = await redisClient.keys('servers:*');
    for (const key of serverKeys) {
      const serverData = JSON.parse(await redisClient.get(key));
      const name = key.split(':')[1];
      
      console.log(`Restoring server: ${name}`);
      
      try {
        // Re-launch MCP server
        const internalPort = serverData.internalPort;
        const serverProcess = await launchMcpServer(serverData.repoDir, internalPort);
        
        if (serverProcess) {
          // Update in-memory tracking
          mcpServers[name] = {
            ...serverData,
            process: serverProcess
          };
          
          // Set up proxy route
          const proxyPath = `/mcs/${name}`;
          app.use(proxyPath, createProxyMiddleware({
            target: `http://localhost:${internalPort}`,
            pathRewrite: {
              [`^${proxyPath}`]: '',
            },
            ws: true,
          }));
          
          console.log(`Restored server ${name} on port ${internalPort}`);
        } else {
          console.error(`Failed to restore server ${name}`);
          await redisClient.del(key);
        }
      } catch (error) {
        console.error(`Error restoring server ${name}:`, error);
        await redisClient.del(key);
      }
    }
    
    console.log('Server initialization from Redis complete');
  } catch (error) {
    console.error('Error initializing from Redis:', error);
  }
}

// Clone a git repository
async function cloneRepo(repoUrl) {
  const repoDir = path.join('/tmp', 'repos', new Date().getTime().toString());
  
  await fs.ensureDir(repoDir);
  
  return new Promise((resolve, reject) => {
    exec(`git clone ${repoUrl} ${repoDir}`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(repoDir);
    });
  });
}

// Find an available port (internal only)
async function getNextAvailablePort() {
  const port = nextAvailablePort;
  nextAvailablePort++;
  
  // Persist next port to Redis
  await redisClient.set('next_port', nextAvailablePort.toString());
  
  return port;
}

// Launch an MCP server with Smithery
async function launchMcpServer(repoDir, port) {
  const serverProcess = spawn('npx', ['smithery', 'serve', '--port', port.toString()], {
    cwd: repoDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  // Simple logging
  serverProcess.stdout.on('data', (data) => {
    console.log(`[MCP:${port}] ${data.toString().trim()}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(`[MCP:${port}] ${data.toString().trim()}`);
  });
  
  // Check if server started successfully
  return new Promise((resolve) => {
    setTimeout(() => {
      if (serverProcess.exitCode === null) {
        resolve(serverProcess);
      } else {
        resolve(null);
      }
    }, 5000);
  });
}

// API endpoint to launch a new MCP server with a named directory
app.post('/api/launch', async (req, res) => {
  try {
    const { repoUrl, name } = req.body;
    
    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }
    
    if (!name) {
      return res.status(400).json({ error: 'Directory name is required' });
    }
    
    // Check if name is valid for a URL path
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
      return res.status(400).json({ error: 'Directory name must contain only letters, numbers, dashes, and underscores' });
    }
    
    // Check if a server with this name already exists
    if (Object.values(mcpServers).some(server => server.name === name) || 
        await redisClient.exists(`servers:${name}`)) {
      return res.status(409).json({ error: `A server with name "${name}" already exists` });
    }
    
    // Clone repository
    const repoDir = await cloneRepo(repoUrl);
    
    // Allocate internal port
    const internalPort = await getNextAvailablePort();
    
    // Launch MCP server
    const serverProcess = await launchMcpServer(repoDir, internalPort);
    
    if (!serverProcess) {
      return res.status(500).json({ error: 'Failed to start MCP server' });
    }
    
    // Create server object
    const serverData = {
      name,
      repoUrl,
      repoDir,
      internalPort,
      startedAt: new Date().toISOString()
    };
    
    // Store in memory
    mcpServers[name] = {
      ...serverData,
      process: serverProcess
    };
    
    // Store in Redis (excluding the process object which can't be serialized)
    await redisClient.set(`servers:${name}`, JSON.stringify(serverData));
    
    // Set up the proxy for this instance
    const proxyPath = `/mcs/${name}`;
    app.use(proxyPath, createProxyMiddleware({
      target: `http://localhost:${internalPort}`,
      pathRewrite: {
        [`^${proxyPath}`]: '',
      },
      ws: true,
    }));
    
    return res.json({
      name,
      repoUrl,
      sseEndpoint: `/mcs/${name}/sse`,
      apiEndpoint: `/mcs/${name}`,
      startedAt: serverData.startedAt
    });
  } catch (error) {
    console.error('Launch error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get all running servers
app.get('/api/servers', async (req, res) => {
  const serverList = Object.values(mcpServers).map(server => ({
    name: server.name,
    repoUrl: server.repoUrl,
    sseEndpoint: `/mcs/${server.name}/sse`,
    apiEndpoint: `/mcs/${server.name}`,
    startedAt: server.startedAt
  }));
  
  res.json(serverList);
});

// Terminate a specific server
app.delete('/api/servers/:name', async (req, res) => {
  const { name } = req.params;
  
  if (!mcpServers[name]) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  // Kill the process
  const server = mcpServers[name];
  server.process.kill();
  
  // Remove from memory
  delete mcpServers[name];
  
  // Remove from Redis
  await redisClient.del(`servers:${name}`);
  
  res.json({ message: 'Server terminated successfully' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    servers: Object.keys(mcpServers).length
  });
});

// Serve the main UI for all routes that aren't explicitly handled
app.get('*', (req, res) => {
  // Skip if it's an API route or MCS route
  if (req.url.startsWith('/api/') || req.url.startsWith('/mcs/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize from Redis and then start the server
async function startServer() {
  try {
    await initializeFromRedis();
    app.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Handle shutdown gracefully
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('Shutting down all MCP servers...');
  
  // Terminate all running MCP servers
  Object.values(mcpServers).forEach(server => {
    try {
      server.process.kill();
    } catch (error) {
      console.error(`Error terminating server ${server.name}:`, error);
    }
  });
  
  // Close Redis connection
  await redisClient.quit();
  
  process.exit(0);
}