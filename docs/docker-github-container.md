# AppsZone Mail Server Docker + GHCR Deployment Notes

> **Note (2026-08-12):** the image was renamed to **`ghcr.io/syedamirali/server-panel:latest`**
> and `docker-compose.yml` now carries that name directly, so `docker compose build`
> tags it and `docker compose push` (`yarn docker:push`) publishes it — the manual
> `docker tag` step below is no longer needed. The old `appszone-mail-server` name is
> kept in the log that follows as a record of the original session.

## Goal

AppsZone Mail Server Docker image local machine থেকে GitHub Container Registry `GHCR`-এ push করা এবং পরে সার্ভারে container হিসেবে run করা।

---

## 1. GitHub CLI Authentication Check

প্রথমে GitHub CLI login status check করা হয়েছিল।

```bash
gh auth status
```

Output-এ দেখা যায় GitHub account login ছিল:

```text
Logged in to github.com account SyedAmirAli
Git operations protocol: ssh
Token scopes: admin:public_key, gist, read:org, repo
```

কিন্তু প্রথমে `write:packages` scope ছিল না।

---

## 2. Docker Login to GHCR

GitHub CLI token ব্যবহার করে Docker-কে GHCR-এ login করা হয়।

```bash
gh auth token | docker login ghcr.io -u SyedAmirAli --password-stdin
```

Output:

```text
Login Succeeded
```

এতে Docker এখন `ghcr.io` registry-তে push/pull করতে পারে।

---

## 3. Existing Docker Images Check

Local Docker images দেখা হয়।

```bash
docker images
```

Relevant image ছিল:

```text
appszone-mail-server:latest
```

---

## 4. Docker Image Tag for GHCR

GHCR format অনুযায়ী image tag করা হয়।

```bash
docker tag appszone-mail-server:latest ghcr.io/syedamirali/appszone-mail-server:latest
```

GHCR image path:

```text
ghcr.io/syedamirali/appszone-mail-server:latest
```

---

## 5. First Push Error

Push করার সময় প্রথমে error আসে:

```bash
docker push ghcr.io/syedamirali/appszone-mail-server:latest
```

Error:

```text
permission_denied: The token provided does not match expected scopes
```

Reason:

```text
GitHub token-এ write:packages scope ছিল না।
```

---

## 6. Fix GHCR Permission Scope

GitHub CLI token refresh করে package write permission add করা হয়।

```bash
gh auth refresh -h github.com -s write:packages -s read:packages
```

তারপর আবার Docker login করা হয়:

```bash
gh auth token | docker login ghcr.io -u SyedAmirAli --password-stdin
```

---

## 7. Successful Docker Image Push

আবার push করার পর image successfully GHCR-এ upload হয়।

```bash
docker push ghcr.io/syedamirali/appszone-mail-server:latest
```

Successful output:

```text
latest: digest: sha256:0349caf02fae0fcc2aaf49c32fbb7ae27fc634b5b1045ca52d56bb15ba83df8e size: 856
```

Final pushed image:

```text
ghcr.io/syedamirali/appszone-mail-server:latest
```

---

## 8. Pulling Image on Server

Server/VPS-এ image pull করার command:

```bash
docker pull ghcr.io/syedamirali/appszone-mail-server:latest
```

If package is private, server must login first:

```bash
gh auth token | docker login ghcr.io -u SyedAmirAli --password-stdin
```

Or using GitHub PAT:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u SyedAmirAli --password-stdin
```

Required permission:

```text
read:packages
```

---

## 9. First App Run Issue

App container run করার সময় database না পেয়ে wait করছিল:

```text
==> Waiting for database...
attempt 1/30...
attempt 2/30...
```

Reason:

```text
appszone-mail-server image একা run করলে হবে না।
এর সাথে MySQL database container দরকার।
```

---

## 10. Docker Network Create

App এবং MySQL একই Docker network-এ রাখার জন্য network create করা হয়।

```bash
docker network create appszone-net
```

---

## 11. MySQL Container Run

MySQL container run করা হয়।

```bash
docker run -d \
  --name appszone-mysql-server \
  --network appszone-net \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=appszone_mail \
  -p 3307:3306 \
  mysql:8.0
```

MySQL container name:

```text
appszone-mysql-server
```

Database:

```text
appszone_mail
```

---

## 12. Container Name Conflict Issue

App container run করার সময় error আসে:

```text
Conflict. The container name "/appszone-mail-server" is already in use
```

Reason:

```text
আগের appszone-mail-server container এখনও Docker-এ exist করছিল।
```

Fix:

```bash
docker rm -f appszone-mail-server
```

---

## 13. App Container Run with Database URL

MySQL container ready হওয়ার পর app run করা হয়।

```bash
docker run --rm \
  --name appszone-mail-server \
  --network appszone-net \
  -p 4010:4010 \
  -e DATABASE_URL="mysql://root:root@appszone-mysql-server:3306/appszone_mail" \
  ghcr.io/syedamirali/appszone-mail-server:latest
```

Important:

```text
Inside Docker network, database host is container name:
appszone-mysql-server
```

So database URL uses:

```text
appszone-mysql-server:3306
```

not:

```text
localhost:3306
```

---

## 14. Prisma Migration and DB Sync

App startup-এর সময় Prisma migration status check হয়।

```text
7 migrations found in prisma/migrations
Database schema is up to date
```

তারপর Prisma db push run হয়:

```text
Your database is now in sync with your Prisma schema
Generated Prisma Client
```

Meaning:

```text
App successfully connected to MySQL
Database schema synced
Prisma client generated
```

---

## 15. NestJS App Started Successfully

App successfully start হয়।

```text
Nest application successfully started
```

Available URLs:

```text
App     http://localhost:4010/
API     http://localhost:4010/api/v1
Docs    http://localhost:4010/swagger
Health  http://localhost:4010/api/v1/health
```

---

## 16. Health Check

App running verify করার জন্য:

```bash
curl http://localhost:4010/api/v1/health
```

Public IP থেকে test:

```bash
curl http://YOUR_PUBLIC_IP:4010/api/v1/health
```

Browser:

```text
http://YOUR_PUBLIC_IP:4010
```

---

## 17. Public Port Binding

App run command-এ port mapping ছিল:

```bash
-p 4010:4010
```

Docker এটা host machine-এর সব interface-এ bind করে:

```text
0.0.0.0:4010->4010/tcp
```

Meaning:

```text
Public IP:4010 দিয়ে access করা যাবে, যদি firewall allow করে।
```

---

## 18. Firewall Check

Ubuntu VPS হলে firewall check:

```bash
sudo ufw status
```

Port allow:

```bash
sudo ufw allow 4010/tcp
```

---

## 19. Useful Docker Commands

All containers:

```bash
docker ps -a
```

Running containers:

```bash
docker ps
```

Logs:

```bash
docker logs -f appszone-mail-server
```

Remove old app container:

```bash
docker rm -f appszone-mail-server
```

Remove unused image:

```bash
docker rmi azm-app:test
```

Clean unused Docker resources:

```bash
docker system prune -a --volumes -f
```

---

## Final Working Architecture

```text
GHCR Image
  ↓
ghcr.io/syedamirali/appszone-mail-server:latest
  ↓
Docker Pull on Server
  ↓
appszone-mail-server container
  ↓
Docker Network: appszone-net
  ↓
appszone-mysql-server container
```

Runtime:

```text
Public IP:4010
  ↓
Docker Port Mapping
  ↓
NestJS App
  ↓
MySQL Database
```

Final app image:

```text
ghcr.io/syedamirali/appszone-mail-server:latest
```

Final run command:

```bash
docker run --rm \
  --name appszone-mail-server \
  --network appszone-net \
  -p 4010:4010 \
  -e DATABASE_URL="mysql://root:root@appszone-mysql-server:3306/appszone_mail" \
  ghcr.io/syedamirali/appszone-mail-server:latest
```
