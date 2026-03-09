FROM node:18-alpine AS deps
WORKDIR /app
COPY src/package.json ./
RUN npm install --only=production

FROM node:18-alpine AS production

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3002

CMD ["node", "index.js"]