FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN npx playwright install chromium --with-deps
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/main"]
