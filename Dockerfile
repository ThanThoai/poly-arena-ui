FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN mkdir -p public
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# HOT_RELOAD=1 → run "next dev" (live code changes without rebuild)
# Default (unset or 0) → run production "node server.js"
ENV HOT_RELOAD=0
ENV PORT=3000

# Copy production build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Also copy source + deps so hot-reload mode can use them
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs

CMD ["sh", "-c", "if [ \"$HOT_RELOAD\" = '1' ]; then npx next dev -p $PORT; else node server.js; fi"]
