# MCS Proxy Manager

A NodeJS API for managing multiple Model Context Servers (MCS) using Smithery with proxy-based routing. This application allows you to:

- Deploy multiple MCS instances from Git repositories
- Access each instance via a human-readable subdirectory path
- Manage instances with a simple REST API
- Persist instance configurations with Redis

## Features

- **Named Subdirectory Routing**: Access each MCS via `/mcs/{name}/` path
- **Git Repository Support**: Launch MCS instances directly from Git repositories
- **Redis Persistence**: Configurations persist across restarts
- **Single Port Exposure**: Only a single port needs to be exposed
- **Automatic Recovery**: MCS instances are automatically recovered on restart

## API Endpoints

### Launch a new MCS instance

```
POST /api/launch
```

Request body:
```json
{
  "repoUrl": "https://github.com/your-username/your-mcp-repo.git",
  "name": "project-x"
}
```

Response:
```json
{
  "name": "project-x",
  "repoUrl": "https://github.com/your-username/your-mcp-repo.git",
  "sseEndpoint": "/mcs/project-x/sse",
  "apiEndpoint": "/mcs/project-x"
}
```

### List all running instances

```
GET /api/servers
```

### Terminate a specific instance

```
DELETE /api/servers/{name}
```

### Health check

```
GET /api/health
```

## Deployment with Docker Compose

The application is packaged with Docker Compose for easy deployment:

```bash
# Clone the repository
git clone https://github.com/phxdev1/mcs-proxy-manager.git
cd mcs-proxy-manager

# Start the services
docker-compose up -d
```

## Environment Variables

| Name | Description | Default |
|------|-------------|---------|
| PORT | Port for the API server | 3000 |
| REDIS_HOST | Redis host | redis |
| REDIS_PORT | Redis port | 6379 |

## Architecture

The application consists of:

1. **API Server**: NodeJS Express application for managing MCS instances
2. **Redis**: For persisting instance configurations
3. **Dynamic Proxying**: Routes requests to the appropriate MCS instance

## Use Case in RunPod

This project is particularly useful for RunPod deployments where:

1. You need to host multiple Model Context Servers
2. You want to expose them all through a single port
3. You need to manage them programmatically
4. You need instance persistence across restarts

## License

MIT