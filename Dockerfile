FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline

FROM dependencies AS builder

ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

FROM dependencies AS production-dependencies

RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime

ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    PORT=3000 \
    VINEXT_TRUST_PROXY=1 \
    VINEXT_TRUSTED_HOSTS=evidenceops.example

ARG CCLOUD_VERSION=0.6.12

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tar \
    && ccloud_tmp_dir="$(mktemp -d)" \
    && curl -fsSL "https://binaries.cockroachdb.com/ccloud/ccloud_linux-amd64_${CCLOUD_VERSION}.tar.gz" -o "${ccloud_tmp_dir}/ccloud.tar.gz" \
    && tar -xzf "${ccloud_tmp_dir}/ccloud.tar.gz" -C "${ccloud_tmp_dir}" \
    && install -m 0755 "${ccloud_tmp_dir}/ccloud" /usr/local/bin/ccloud \
    && rm -rf "${ccloud_tmp_dir}" /var/lib/apt/lists/*

WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist/standalone ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --chmod=755 --chown=node:node infra/lightsail/ccloud-entrypoint.sh /usr/local/bin/evidenceops-entrypoint

RUN mkdir -p /home/node/.config/cockroachdb \
    && chown -R node:node /home/node

USER node
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/evidenceops-entrypoint"]
CMD ["node", "server.js"]
