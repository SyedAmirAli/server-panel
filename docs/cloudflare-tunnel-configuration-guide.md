# Cloudflare Tunnel Configuration Guide (Existing Tunnel)

## Overview

This guide explains how to expose a new application through an **existing Cloudflare Tunnel** without creating another tunnel.

Example:

| Item            | Value                                                   |
| --------------- | ------------------------------------------------------- |
| Tunnel ID       | `498df61f-208d-464a-9018-424dfceacbd4`                  |
| Tunnel Hostname | `498df61f-208d-464a-9018-424dfceacbd4.cfargotunnel.com` |
| Local Service   | `http://localhost:4010`                                 |
| Public Domain   | `mailserver.appszonebd.com`                             |

---

# 1. Verify Local Application

Before configuring Cloudflare, verify the application is running locally.

```bash
curl http://localhost:4010/api/v1/health
```

Expected response:

```json
{
    "status": "ok",
    "service": "appszone-mail-server"
}
```

If this fails, Cloudflare configuration is not the problem.

---

# 2. Existing Tunnel

Current tunnel:

```text
498df61f-208d-464a-9018-424dfceacbd4
```

Tunnel endpoint:

```text
498df61f-208d-464a-9018-424dfceacbd4.cfargotunnel.com
```

A single tunnel can proxy many domains simultaneously.

---

# 3. Configure DNS

Inside the Cloudflare DNS zone:

| Type  | Name         | Target                                                  |
| ----- | ------------ | ------------------------------------------------------- |
| CNAME | `mailserver` | `498df61f-208d-464a-9018-424dfceacbd4.cfargotunnel.com` |

Enable **Proxy (Orange Cloud)**.

---

# 4. Update Tunnel Configuration

Edit:

```text
/etc/cloudflared/config.yml
```

or, if using a different configuration path, update that file instead.

Example:

```yaml
tunnel: 498df61f-208d-464a-9018-424dfceacbd4

credentials-file: /etc/cloudflared/498df61f-208d-464a-9018-424dfceacbd4.json

ingress:
    - hostname: fccrm.futureconnect.net.au
      service: http://localhost:3000

    - hostname: appszonebd.com
      service: http://localhost:3010

    - hostname: www.appszonebd.com
      service: http://localhost:3010

    - hostname: crm.appszonebd.com
      service: http://localhost:8000

    - hostname: mailserver.appszonebd.com
      service: http://localhost:4010

    - service: http_status:404
```

**Important**

The fallback rule:

```yaml
- service: http_status:404
```

must always remain the final rule.

---

# 5. Validate Configuration

```bash
cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml
```

Expected:

```text
OK
```

---

# 6. Restart Cloudflared

```bash
systemctl restart cloudflared
```

Verify:

```bash
systemctl status cloudflared
```

---

# 7. Verify Active Configuration

Check which configuration file the service actually uses.

```bash
systemctl cat cloudflared
```

Example:

```ini
ExecStart=/usr/bin/cloudflared --config /etc/cloudflared/config.yml tunnel run
```

This determines the file Cloudflared loads.

---

# 8. Common Mistake Encountered

Initially, the configuration was edited here:

```text
/root/.cloudflared/config.yml
```

However, the systemd service loaded:

```text
/etc/cloudflared/config.yml
```

As a result:

- DNS resolved correctly.
- Tunnel connected correctly.
- Requests returned:

```text
HTTP/2 404
```

because the running service never loaded the new hostname.

The fix was to update the configuration file actually referenced by systemd.

---

# 9. Test Local Tunnel Routing

```bash
cloudflared tunnel ingress rule https://mailserver.appszonebd.com/api/v1/health --config /etc/cloudflared/config.yml
```

Expected service:

```text
http://localhost:4010
```

---

# 10. Test Public Access

```bash
curl https://mailserver.appszonebd.com/api/v1/health
```

Expected:

```json
{
    "status": "ok",
    "service": "appszone-mail-server"
}
```

---

# 11. Useful Commands

Validate configuration:

```bash
cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml
```

Restart:

```bash
systemctl restart cloudflared
```

View logs:

```bash
journalctl -u cloudflared -f
```

Show service:

```bash
systemctl status cloudflared
```

Show service definition:

```bash
systemctl cat cloudflared
```

Verify local service:

```bash
curl http://localhost:4010/api/v1/health
```

Verify public endpoint:

```bash
curl https://mailserver.appszonebd.com/api/v1/health
```

---

# Troubleshooting Checklist

- Local application responds on its local port.
- DNS CNAME points to `<TunnelID>.cfargotunnel.com`.
- Cloudflare proxy is enabled.
- The hostname exists in `config.yml`.
- The hostname rule appears before the `http_status:404` fallback.
- The configuration file being edited matches the one referenced by `systemctl cat cloudflared`.
- Configuration validates successfully.
- `cloudflared` service is restarted after every configuration change.
- Public endpoint returns the expected application response instead of `404`.
