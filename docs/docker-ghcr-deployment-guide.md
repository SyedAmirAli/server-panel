# AppsZone Mail Server Deployment Guide (Docker + GHCR)

## Overview

This document describes the complete deployment workflow for the AppsZone Mail Server, including:

- Local Docker image build
- Local testing
- Publishing to GitHub Container Registry (GHCR)
- Server preparation
- MariaDB configuration
- Pulling and running the image
- Common troubleshooting

---

# 1. Build the Docker Image Locally

From the project root:

```bash
docker build -t appszone-mail-server:latest .
```

Verify:

```bash
docker images
```

---

# 2. Test the Image Locally

Run the image:

```bash
docker run --rm -p 4010:4010 --env-file .env appszone-mail-server:latest
```

Verify:

- Application starts successfully.
- Database connection works.
- API responds correctly.

---

# 3. Login to GitHub Container Registry

Store the GitHub Personal Access Token:

```bash
export GHCR_TOKEN=YOUR_GITHUB_PAT
```

Login:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Example:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u siyamzakir --password-stdin
```

Required PAT permissions:

- read:packages
- write:packages

---

# 4. Tag the Image

Example:

```bash
docker tag appszone-mail-server:latest ghcr.io/siyamzakir/appszone-mail-server:latest
```

---

# 5. Push to GHCR

```bash
docker push ghcr.io/siyamzakir/appszone-mail-server:latest
```

Verify from another machine:

```bash
docker pull ghcr.io/siyamzakir/appszone-mail-server:latest
```

---

# 6. Server Preparation

Install:

- Docker
- Docker Compose

Verify:

```bash
docker --version
```

```bash
docker compose version
```

---

# 7. Login to GHCR on the Server

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u siyamzakir --password-stdin
```

---

# 8. Pull the Image

```bash
docker pull ghcr.io/siyamzakir/appszone-mail-server:latest
```

---

# 9. Prepare MariaDB

Create the application database:

```sql
CREATE DATABASE mail_appszonemail CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Create the shadow database for Prisma:

```sql
CREATE DATABASE mail_appszonemail_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Create/update the user:

```sql
CREATE USER IF NOT EXISTS 'mail_appszonemail'@'localhost' IDENTIFIED BY 'Siyamcse@30';
CREATE USER IF NOT EXISTS 'mail_appszonemail'@'%' IDENTIFIED BY 'Siyamcse@30';
ALTER USER 'mail_appszonemail'@'localhost' IDENTIFIED BY 'Siyamcse@30';
ALTER USER 'mail_appszonemail'@'%' IDENTIFIED BY 'Siyamcse@30';
```

Grant permissions:

```sql
GRANT ALL PRIVILEGES ON mail_appszonemail.* TO 'mail_appszonemail'@'localhost';
GRANT ALL PRIVILEGES ON mail_appszonemail.* TO 'mail_appszonemail'@'%';
GRANT ALL PRIVILEGES ON mail_appszonemail_shadow.* TO 'mail_appszonemail'@'localhost';
GRANT ALL PRIVILEGES ON mail_appszonemail_shadow.* TO 'mail_appszonemail'@'%';
FLUSH PRIVILEGES;
```

---

# 10. Verify Docker Can Reach MariaDB

```bash
docker run --rm --add-host=host.docker.internal:host-gateway mysql:8.0 mysql -h host.docker.internal -P 3306 -u mail_appszonemail -p"Siyamcse@30" -e "SHOW DATABASES;"
```

Successful output confirms:

- Docker networking works.
- Credentials are correct.
- MariaDB accepts remote Docker connections.

---

# 11. Docker Compose Configuration

Example:

```yaml
services:
    app:
        image: ghcr.io/siyamzakir/appszone-mail-server:latest
        container_name: appszone-mail-server
        restart: unless-stopped

        ports:
            - "4010:4010"

        extra_hosts:
            - "host.docker.internal:host-gateway"

        environment:
            MYSQL_HOST: host.docker.internal
            MYSQL_PORT: 3306
            MYSQL_DATABASE: mail_appszonemail
            MYSQL_USER: mail_appszonemail
            MYSQL_PASSWORD: Siyamcse@30
```

**Important:** Remove any `build:` section when deploying a prebuilt GHCR image.

---

# 12. Start the Application

```bash
docker compose up -d
```

View logs:

```bash
docker logs -f appszone-mail-server
```

---

# 13. Common Problems Encountered

## Problem: GHCR Pull Access Denied

Cause:

- Not logged in.
- Invalid PAT.
- Missing package permissions.

Fix:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u siyamzakir --password-stdin
```

---

## Problem: Duplicate Images

Old image remained locally.

Solution:

```bash
docker rm -f $(docker ps -aq --filter ancestor=ghcr.io/syedamirali/appszone-mail-server:latest)
```

```bash
docker rmi ghcr.io/syedamirali/appszone-mail-server:latest
```

---

## Problem: Container Name Already Exists

Error:

```
Conflict. The container name already exists.
```

Solution:

```bash
docker rm -f appszone-mail-server
```

---

## Problem: Port Already in Use

Error:

```
failed to bind host port 4010
```

Find the process:

```bash
sudo lsof -i :4010
```

Stop it:

```bash
sudo kill -9 PID
```

---

## Problem: Database Wait Loop

Container repeatedly printed:

```
Waiting for database...
```

Investigation:

- MariaDB accepted local connections.
- Docker connectivity was verified.
- Database user permissions were corrected.
- Required databases were created.
- Docker networking to `host.docker.internal` was verified.

Root cause:

The application database (`mail_appszonemail`) did not exist or the user lacked permissions for it.

Solution:

- Create the missing database.
- Grant permissions.
- Verify connectivity from a Docker container.

---

# 14. Useful Commands

Show images:

```bash
docker images
```

Show containers:

```bash
docker ps
```

Show all containers:

```bash
docker ps -a
```

Remove container:

```bash
docker rm -f CONTAINER_NAME
```

Remove image:

```bash
docker rmi IMAGE_NAME
```

View logs:

```bash
docker logs -f CONTAINER_NAME
```

Restart:

```bash
docker restart CONTAINER_NAME
```

Stop:

```bash
docker stop CONTAINER_NAME
```

Pull latest image:

```bash
docker pull ghcr.io/siyamzakir/appszone-mail-server:latest
```

Deploy latest image:

```bash
docker compose down && docker pull ghcr.io/siyamzakir/appszone-mail-server:latest && docker compose up -d
```

---

# Deployment Checklist

- Build Docker image locally.
- Test locally.
- Login to GHCR.
- Tag image.
- Push image.
- Login on server.
- Pull image.
- Create databases.
- Create/update MariaDB user.
- Grant privileges.
- Verify Docker ↔ MariaDB connectivity.
- Configure `docker-compose.yml`.
- Remove `build:` section.
- Start the container.
- Verify logs.
- Test application endpoints.

Following this workflow provides a repeatable deployment process with GHCR as the image source and Docker Compose for runtime management.
