import 'dotenv/config';
import express, { Request, Response } from 'express';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { PriceIndexService } from './lib/price-index';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const CRON_TOKEN = process.env.CRON_TOKEN || 'default-secret-token';
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 3 * * *';
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || 'Asia/Bangkok';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

app.use(express.json());

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
    console.log(`[${new Date().toISOString()}] Cron job triggered via POST request`);
    
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

async function performCronTask(): Promise<void> {
  console.log('Executing cron task...');

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

cron.schedule(CRON_SCHEDULE, async () => {
  console.log(`[${new Date().toISOString()}] Scheduled cron job triggered`);
  try {
    await performCronTask();
  } catch (error) {
    console.error('Error in scheduled cron job:', error);
  }
}, { timezone: CRON_TIMEZONE });

app.get('/health', (_: Request, res: Response) => {
  res.json({
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cronSchedule: CRON_SCHEDULE,
    cronTimezone: CRON_TIMEZONE
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Cron schedule: ${CRON_SCHEDULE}`);
  console.log(`Cron timezone: ${CRON_TIMEZONE}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
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
