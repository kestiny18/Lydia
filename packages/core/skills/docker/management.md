---
name: docker-container-management
description: Manage Docker containers and images
tags: [docker, containers, devops]
---

# Docker Container Management

This skill helps you build, run, and manage Docker containers.

## Common Tasks

### 1. Build Image
- Look for `Dockerfile`.
- Run: `docker build -t <image-name> .`

### 2. Run Container
- Run: `docker run -d --name <container-name> -p <host-port>:<container-port> <image-name>`
- Example: `docker run -d --name my-redis -p 6379:6379 redis`

### 3. Manage State
- **List Running**: `docker ps`
- **List All**: `docker ps -a`
- **Stop**: `docker stop <container-id>`
- **Remove**: `docker rm <container-id>`
- **Logs**: `docker logs -f <container-id>`

### 4. Cleanup
- **Prune Stopped Containers**: `docker container prune`
- **Prune Unused Images**: `docker image prune`

## Docker Compose
- IF `docker-compose.yml` exists:
  - Start: `docker-compose up -d`
  - Stop: `docker-compose down`
  - Logs: `docker-compose logs -f`
