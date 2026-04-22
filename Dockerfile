FROM node:20-slim

# Install Chromium, its dependencies, and dumb-init (PID 1 reaper for zombie cleanup)
RUN apt-get update && apt-get install -y \
    chromium \
    dumb-init \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the installed Chromium instead of downloading its own
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install all deps (including devDependencies for prisma CLI + tsc)
RUN npm ci

# Generate Prisma client; PATH includes node_modules/.bin so zod-prisma-types generator is found
RUN export PATH="/app/node_modules/.bin:$PATH" && node_modules/.bin/prisma generate

COPY tsconfig.json ./
COPY src ./src/

RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

RUN mkdir -p logs

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
