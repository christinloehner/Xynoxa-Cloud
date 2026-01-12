FROM node:22-slim AS base
WORKDIR /app
# Zusatz-Build-Dependencies, damit Sharp notfalls aus Source gebaut werden kann
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        build-essential \
        python3 \
        pkg-config \
        libvips-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libwebp-dev \
        libtiff5-dev \
        libgif-dev \
        librsvg2-dev && \
    rm -rf /var/lib/apt/lists/*
ENV PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig"
ENV npm_config_sharp_libvips_local=true
ENV npm_config_sharp_libvips_download=false

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
ARG APP_DOMAIN
ARG APP_URL
ENV NODE_ENV=production \
    APP_DOMAIN=${APP_DOMAIN} \
    APP_URL=${APP_URL}
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV PORT=3000
RUN mkdir -p logs && chmod 755 logs
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
