import 'dotenv/config';
import express, { Request, Response } from 'express';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PriceIndexService } from './lib/price-index';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const CRON_TOKEN = process.env.CRON_TOKEN || 'default-secret-token';
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 3 * * *';
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || 'Asia/Bangkok';
const CRON_ENABLED = process.env.CRON_ENABLED !== 'false';
const LOG_DIR = process.env.LOG_DIR || 'logs';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

app.use(express.json());

function log(message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const line = meta
    ? `[${timestamp}] ${message} ${JSON.stringify(meta)}`
    : `[${timestamp}] ${message}`;

  console.log(line);

  try {
    const dir = path.resolve(process.cwd(), LOG_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const date = timestamp.slice(0, 10);
    const logfile = path.join(dir, `app-${date}.log`);
    fs.appendFileSync(logfile, `${line}\n`, { encoding: 'utf8' });
  } catch (error) {
    console.error('Failed to write log file:', error);
  }
}

function requireBearerToken(req: Request, res: Response): boolean {
  const token = req.headers['authorization'];

  console.log(req.headers)

  console.log(token)

  if (!token || token !== `Bearer ${CRON_TOKEN}`) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing token',
    });
    return false;
  }

  return true;
}

app.post('/cron', async (req: Request, res: Response) => {
  if (!requireBearerToken(req, res)) return;

  try {
    log('Cron job triggered via POST request');

    await performCronTask();

    res.json({ 
      success: true, 
      message: 'Cron job executed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error executing cron job:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error executing cron job',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/scrape/rm', async (req: Request, res: Response) => {
  if (!requireBearerToken(req, res)) return;

  try {
    console.log(`[${new Date().toISOString()}] scrapeRm triggered via POST request`);
    const service = new PriceIndexService();
    await service.scrapeRm();

    res.json({
      success: true,
      message: 'scrapeRm executed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error executing scrapeRm:', error);
    res.status(500).json({
      success: false,
      message: 'Error executing scrapeRm',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/scrape/kc', async (req: Request, res: Response) => {
  if (!requireBearerToken(req, res)) return;

  try {
    console.log(`[${new Date().toISOString()}] scrapeKC triggered via POST request`);
    const service = new PriceIndexService();
    await service.scrapeKC();

    res.json({
      success: true,
      message: 'scrapeKC executed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error executing scrapeKC:', error);
    res.status(500).json({
      success: false,
      message: 'Error executing scrapeKC',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  taskName: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${taskName}] Attempt ${attempt}/${maxRetries}`);
      const result = await fn();
      if (attempt > 1) {
        console.log(`[${taskName}] ✅ Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${taskName}] ❌ Attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
      
      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[${taskName}] ⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(
    `[${taskName}] Failed after ${maxRetries} attempts. Last error: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`
  );
}

let isCronRunning = false;

async function performCronTask(): Promise<void> {
  log('Executing cron task...');

  const service = new PriceIndexService();

  try {
    await retryWithBackoff(
      () => service.scrapeRm(),
      'scrapeRm'
    );
  } catch (error) {
    console.error('scrapeRm failed after all retries:', error);
  }

  try {
    await retryWithBackoff(
      () => service.scrapeKC(),
      'scrapeKC'
    );
  } catch (error) {
    console.error('scrapeKC failed after all retries:', error);
  }
}

if (!cron.validate(CRON_SCHEDULE)) {
  log('Invalid CRON_SCHEDULE - cron will not be scheduled', {
    cronSchedule: CRON_SCHEDULE,
    cronTimezone: CRON_TIMEZONE,
  });
} else if (!CRON_ENABLED) {
  log('Cron disabled via CRON_ENABLED=false', {
    cronSchedule: CRON_SCHEDULE,
    cronTimezone: CRON_TIMEZONE,
  });
} else {
  log('Registering scheduled cron job', {
    cronSchedule: CRON_SCHEDULE,
    cronTimezone: CRON_TIMEZONE,
  });

  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      if (isCronRunning) {
        log('Scheduled cron tick skipped (previous run still in progress)');
        return;
      }

      isCronRunning = true;
      const startedAt = Date.now();
      log('Scheduled cron job triggered');

      try {
        await performCronTask();
        log('Scheduled cron job completed', { durationMs: Date.now() - startedAt });
      } catch (error) {
        console.error('Error in scheduled cron job:', error);
        log('Scheduled cron job failed', {
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        isCronRunning = false;
      }
    },
    { timezone: CRON_TIMEZONE },
  );
}

app.get('/health', (_: Request, res: Response) => {
  res.json({
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cronSchedule: CRON_SCHEDULE,
    cronTimezone: CRON_TIMEZONE,
    cronEnabled: CRON_ENABLED,
    cronIsRunning: isCronRunning,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Cron schedule: ${CRON_SCHEDULE}`);
  console.log(`Cron timezone: ${CRON_TIMEZONE}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  log('Process unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  log('Process uncaughtException', {
    error: error.message,
  });
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('HTTP server closed');
    process.exit(0);
  });
});
