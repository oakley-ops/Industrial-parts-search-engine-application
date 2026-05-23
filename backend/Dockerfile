FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN npx playwright install chromium --with-deps
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
