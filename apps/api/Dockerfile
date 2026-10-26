FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install -g bun@1.4.4
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

FROM dependencies AS builder
RUN bun install --frozen-lockfile
COPY apps/api ./apps/api
RUN cd apps/api && bun run build

FROM dependencies AS production-dependencies
RUN bun install --frozen-lockfile --production --filter api \
    && mkdir -p apps/api/node_modules

FROM node:24-bookworm-slim AS runtime
ARG LEGAL_REVISION=local
LABEL org.opencontainers.image.revision=$LEGAL_REVISION
LABEL org.opencontainers.image.source="https://github.com/hemia-labs/legal"
ENV NODE_ENV=production PORT=3017
WORKDIR /app/apps/api
COPY --from=production-dependencies /app/node_modules /app/node_modules
COPY --from=production-dependencies /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY apps/api/package.json ./package.json
USER node
EXPOSE 3017
CMD ["node", "dist/src/main.js"]
