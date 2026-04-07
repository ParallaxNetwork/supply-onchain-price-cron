# Supply Onchain Price Cron

A scheduled price scraping service that fetches Robusta (RM) and Arabica (KC) coffee futures prices from Barchart, stores them in PostgreSQL, and calculates 30-day moving averages with IDR currency conversion.

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5
- **Framework:** Express.js 4
- **Database:** PostgreSQL via Prisma 6
- **Scheduler:** node-cron
- **Scraping:** Puppeteer (headless Chrome/Chromium)
- **Validation:** Zod 4
- **Config:** dotenv

## Description

Runs as a persistent HTTP service with a background cron job. Scrapes active Robusta and Arabica coffee futures contract data from Barchart on a configurable schedule (default: 03:00 GMT+7 daily), persists OHLCV price data to PostgreSQL, computes 30-day moving averages, converts prices to IDR using a live exchange rate, and generates discount values based on configurable `MaDiscountSetting` records.

Features:
- Automated daily price collection for RM (Robusta) and KC (Arabica) coffee futures
- 30-day moving average (MA30) and MA30 change calculation
- IDR conversion via exchangerate-api.com (fallback: 16,000 IDR/USD)
- Bearer token-authenticated HTTP endpoints for manual triggers
- Duplicate-safe via unique constraint on `[type, tradeDate]`
- Graceful shutdown handling

## Installation

### Local

```bash
npm install
cp .env.example .env
# Set DATABASE_URL and CRON_TOKEN at minimum

npm run prisma:generate
npm run prisma:migrate

npm run dev
```

### Production Server

```bash
npm install
npm run build
npm start
```

> **Chromium on Linux servers:** Install Chromium and set `PUPPETEER_EXECUTABLE_PATH`:
> ```bash
> apt-get install -y chromium-browser
> # Then in .env:
> PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
> ```

## API Endpoints

All `POST` endpoints require `Authorization: Bearer <CRON_TOKEN>` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Health check, returns schedule config |
| `POST` | `/cron` | Bearer | Run both RM and KC scrapers sequentially |
| `POST` | `/scrape/rm` | Bearer | Run Robusta (RM) scraper only |
| `POST` | `/scrape/kc` | Bearer | Run Arabica (KC) scraper only |

Example:

```bash
# Trigger full cron task (RM + KC)
curl -X POST http://localhost:3000/cron \
  -H "Authorization: Bearer your-secret-token-here"

# Health check
curl http://localhost:3000/health
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `CRON_TOKEN` | No | `default-secret-token` | Bearer token for API endpoint authentication |
| `CRON_SCHEDULE` | No | `0 3 * * *` | Cron expression (5-field format) |
| `CRON_TIMEZONE` | No | `Asia/Bangkok` | Timezone for cron evaluation (GMT+7) |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | — | Set to `production` on production servers |
| `PUPPETEER_EXECUTABLE_PATH` | No | `/usr/bin/chromium-browser` (prod) | Path to Chromium/Chrome executable |

### CRON_SCHEDULE Format

Standard 5-field cron syntax:

```
* * * * *
│ │ │ │ └─ Day of week (0–7, Sunday = 0 or 7)
│ │ │ └─── Month (1–12)
│ │ └───── Day of month (1–31)
│ └─────── Hour (0–23)
└───────── Minute (0–59)
```

Examples: `0 3 * * *` = daily at 03:00 · `0 0 * * *` = daily at midnight · `*/15 * * * *` = every 15 minutes

The scraper deduplicates by `tradeDate`, so re-running on the same day is safe.

## Database

PostgreSQL is required. Schema managed via Prisma.

```bash
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate    # Apply migrations
npm run prisma:studio     # Open Prisma Studio GUI
```

Key tables:

| Table | Description |
|-------|-------------|
| `MarketData` | OHLCV price data per commodity per date. Unique on `[type, tradeDate]`. Stores USD and IDR prices, MA30, and price change deltas. |
| `MaDiscountSetting` | Configurable discount parameters per commodity (`ARABICA` or `ROBUSTA`) and supply chain stage. |
| `MaDiscountValue` | Computed discount values derived from MA30 and the discount settings. Auto-generated on each scrape. |

No seed data is required to start. `MaDiscountSetting` records must be inserted manually for discount value generation to produce results.

## Third-Party Services

| Service | Purpose | API Key Required |
|---------|---------|-----------------|
| Barchart (web scraping) | Coffee futures price data (RM & KC contracts) | No — scraped via Puppeteer |
| exchangerate-api.com | USD → IDR exchange rate | No — free public endpoint; fallback: 16,000 IDR/USD |

## How It Works

1. On schedule (or manual trigger), `performCronTask()` calls `scrapeRm()` then `scrapeKC()` — each failure is caught independently.
2. Each scraper launches headless Chromium via Puppeteer, navigates to Barchart, and intercepts the `/proxies/core-api/v1/quotes/get` API response to extract OHLCV data.
3. IDR conversion rate is fetched from `exchangerate-api.com` (falls back to 16,000 if unavailable).
4. A 30-day moving average is computed from the last 30 `MarketData` records and stored alongside the price.
5. `MaDiscountValue` records are generated for any configured `MaDiscountSetting` entries.
