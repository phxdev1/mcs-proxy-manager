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
- **CI/CD Integration**: Automatic deployment to RunPod via GitHub Actions

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

## Deployment

### Local Deployment with Docker Compose

```bash
# Clone the repository
git clone https://github.com/phxdev1/mcs-proxy-manager.git
cd mcs-proxy-manager

# Start the services
docker-compose up -d
```

### RunPod Deployment

The application is automatically deployed to RunPod when changes are pushed to the main branch using GitHub Actions.

#### GitHub Actions Setup

This repository includes a GitHub Actions workflow that:

1. Builds a Docker image when code is pushed to main
2. Pushes the image to DockerHub
3. Deploys the image to a RunPod instance

To use this workflow, you need to set up the following GitHub secrets:

- `DOCKERHUB_USERNAME` - Your DockerHub username
- `DOCKERHUB_TOKEN` - Your DockerHub access token
- `RUNPOD_API_KEY` - Your RunPod API key
- `RUNPOD_POD_ID` - The ID of your RunPod instance

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
4. **GitHub Actions**: CI/CD pipeline for automatic deployment

## Use Case in RunPod

This project is particularly useful for RunPod deployments where:

1. You need to host multiple Model Context Servers
2. You want to expose them all through a single port
3. You need to manage them programmatically
4. You need instance persistence across restarts

## License

MIT