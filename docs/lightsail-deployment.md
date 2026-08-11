# EvidenceOps on Amazon Lightsail

Production target: `https://evidenceops.0tt.uk` on the existing Ubuntu Lightsail
instance in `us-east-1`, using Docker Compose behind the host's existing Nginx
and Certbot installation.

The Compose service publishes the application only on `127.0.0.1:3100`.
Nothing binds directly to the instance's public interface, and the existing
sites keep ownership of ports 80 and 443 through Nginx.

## 1. Host prerequisites

Confirm the Lightsail instance has a static IPv4 address before creating the DNS
record. Then install Docker Engine and the Compose plugin from Docker's official
Ubuntu repository:

```bash
sudo bash infra/lightsail/install-docker-ubuntu.sh
```

Reconnect after installation if the script adds the SSH user to the `docker`
group. Do not uninstall or replace the existing Nginx or Certbot packages.

## 2. Application directory and secrets

Keep this checkout in `/opt/evidenceops`. Create the production environment file
from the narrow deployment template, populate it on the server, and restrict it:

```bash
cd /opt/evidenceops
cp infra/lightsail/evidenceops.env.example .env
chmod 600 .env
```

Never place `.env` in the Docker build context, a container image, Git, shell
history, Nginx configuration, or Certbot configuration.

## 3. Build and start

```bash
bash infra/lightsail/deploy-evidenceops.sh /opt/evidenceops
```

The deployment validates the Compose configuration, builds the standalone
Node.js image, starts only the `evidenceops` Compose project, and waits for the
loopback health endpoint. It does not restart unrelated containers.

## 4. Nginx and TLS

Install the dedicated server block and validate the full Nginx configuration
before reloading:

```bash
sudo cp infra/lightsail/nginx-evidenceops.conf /etc/nginx/sites-available/evidenceops.0tt.uk
sudo ln -s /etc/nginx/sites-available/evidenceops.0tt.uk /etc/nginx/sites-enabled/evidenceops.0tt.uk
sudo nginx -t
sudo systemctl reload nginx
```

After the DNS `A` record for `evidenceops.0tt.uk` resolves to the instance's
static IPv4 address, let the existing Certbot Nginx plugin add HTTPS:

```bash
sudo certbot --nginx -d evidenceops.0tt.uk
```

## 5. Verification

```bash
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS https://evidenceops.0tt.uk/api/health
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail=100 app
```

The public verification is not complete until the incident page loads from
CockroachDB Cloud, a Bedrock GPT-OSS investigation passes evidence validation,
and the CockroachDB audit replay reloads over HTTPS.
