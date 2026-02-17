# Price Cron Service

TypeScript Express.js service with cron job functionality, Prisma ORM, and token-based authentication.

## Features

- TypeScript for type safety
- Express.js REST API
- Prisma ORM for database management
- Scheduled cron jobs using node-cron
- POST endpoint with static token validation
- Environment-based configuration
- Health check endpoint
- Graceful shutdown handling

## Tech Stack

- **TypeScript** 5.3+
- **Express.js** 4.18+
- **Prisma** 6.4.1
- **node-cron** 3.0+
- **PostgreSQL** (configurable)

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```env
PORT=3000
CRON_TOKEN=your-secret-token-here
CRON_SCHEDULE=0 * * * *
DATABASE_URL=postgresql://user:password@localhost:5432/price_cron?schema=public
```

## Database Setup

1. **Generate Prisma Client:**
```bash
npm run prisma:generate
```

2. **Run database migrations:**
```bash
npm run prisma:migrate
```

3. **Open Prisma Studio (optional):**
```bash
npm run prisma:studio
```

### Cron Schedule Format

The `CRON_SCHEDULE` uses standard cron syntax:
```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, Sunday = 0 or 7)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

Examples:
- `0 * * * *` - Every hour
- `*/5 * * * *` - Every 5 minutes
- `0 0 * * *` - Daily at midnight
- `0 9 * * 1` - Every Monday at 9 AM

## Usage

### Build the project

```bash
npm run build
```

### Start the server (production)

```bash
npm start
```

### Development mode (with auto-reload)

```bash
npm run dev
```

## API Endpoints

### POST /cron

Manually trigger the cron job with token authentication.

**Headers:**
```
Authorization: Bearer your-secret-token-here
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Cron job executed successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Response (Unauthorized):**
```json
{
  "success": false,
  "message": "Unauthorized: Invalid or missing token"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "cronSchedule": "0 * * * *"
}
```

## Testing

Test the cron endpoint with curl:

```bash
curl -X POST http://localhost:3000/cron \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json"
```

## Project Structure

```
price-cron/
├── src/
│   └── index.ts          # Main application entry point
├── prisma/
│   └── schema.prisma     # Prisma database schema
├── dist/                 # Compiled TypeScript output
├── package.json
├── tsconfig.json
└── .env
```

## Customization

Modify the `performCronTask()` function in `src/index.ts` to implement your custom cron job logic. The function is async and has access to the Prisma client for database operations.
