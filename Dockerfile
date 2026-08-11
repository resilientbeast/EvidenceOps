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
    VINEXT_TRUSTED_HOSTS=evidenceops.0tt.uk

WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist/standalone ./
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000

CMD ["node", "server.js"]
