FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps ./apps
COPY db ./db
COPY scripts ./scripts
COPY content ./content
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

FROM base AS build
# Canonical URLs, hreflang and the sitemap are generated at BUILD time: pass the real public origin.
ARG SITE_URL=https://lingora.world
ENV SITE_URL=$SITE_URL
RUN npm -w apps/web run build

FROM build AS web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && npm -w apps/web run start"]

FROM base AS worker
ENV NODE_ENV=production
CMD ["node", "apps/worker/src/index.js"]
