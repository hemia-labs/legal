FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g bun@1.4.4
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN bun install --frozen-lockfile
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1 LEGAL_API_URL=http://api:3017
RUN cd apps/web && bun run build

FROM node:24-bookworm-slim AS runtime
ARG LEGAL_REVISION=local
LABEL org.opencontainers.image.revision=$LEGAL_REVISION
LABEL org.opencontainers.image.source="https://github.com/hemia-labs/legal"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 LEGAL_API_URL=http://api:3017
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
