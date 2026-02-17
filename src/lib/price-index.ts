import puppeteer from "puppeteer";
import { db } from "../server/db";
import type { MarketData } from "@prisma/client";

/* ---------------------------------------
   CONSTANTS
---------------------------------------- */

const KC_URL = "https://www.barchart.com/futures/quotes/KC*0/futures-prices?timeFrame=daily";
const RM_URL = "https://www.barchart.com/futures/quotes/RM*0/futures-prices?timeFrame=daily";
const TONNE_TO_KG = 1000; // 1 metric tonne = 1000 kg
const LB_TO_KG = 1 / 0.453592; // 1 pound = 0.453592 kg

/* ---------------------------------------
   TYPES
---------------------------------------- */
interface ExchangeRates {
  rates: {
    IDR: number;
    [key: string]: number; // Allow other currencies loosely
  };
}

interface BarchartQuoteResponse {
  data: BarchartRaw[];
}

// interface PriceIndexResponse {
//   active: ActiveContract;
//   usdPerKg: number;
//   idrPerKg: number;
// }

interface BarchartRaw {
  symbol: string;
  contractSymbol: string;
  dailyLastPrice: string;
  dailyPriceChange: string;
  dailyOpenPrice: string;
  dailyHighPrice: string;
  dailyLowPrice: string;
  dailyPreviousPrice: string;
  dailyVolume: string;
  dailyOpenInterest: string;
  dailyDate1dAgo: string;
  symbolCode: string;
  symbolType: number;
  hasOptions: 'Yes' | 'No';
  contract: string
  price: number
  raw: {
    symbol: string;
    contractSymbol: string;
    dailyLastPrice: number;
    dailyPriceChange: number;
    dailyOpenPrice: number;
    dailyHighPrice: number;
    dailyLowPrice: number;
    dailyPreviousPrice: number;
    dailyVolume: number;
    dailyOpenInterest: number;
    dailyDate1dAgo: string; // ISO date
    symbolCode: string;
    symbolType: number;
    hasOptions: boolean;
  };
}

/* ---------------------------------------
   CLASS DEFINITION
---------------------------------------- */
export class PriceIndexService {

  public async getIDRConversion(): Promise<number> {
    try {
      const fxRes = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
      const fxJson = (await fxRes.json()) as ExchangeRates;
      return fxJson.rates.IDR;
    } catch {
      console.error("Failed to fetch IDR rate, defaulting to hardcoded value.");
      return 16000; // Fallback
    }
  }

  /**
   * Reusable Puppeteer logic to fetch Barchart JSON data
   */
  private async _fetchBarchartData(targetUrl: string): Promise<BarchartRaw | null> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? 
                      (process.env.NODE_ENV === 'production' ? '/usr/bin/chromium-browser' : undefined),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    try {
      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
      });

      const client = await page.createCDPSession();
      await client.send("Network.setUserAgentOverride", {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/122.0.0.0 Safari/537.36",
        platform: "Windows",
      });

      let interceptedJson: BarchartQuoteResponse | null = null;

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      page.on("response", async (response) => {
        const reqUrl = response.request().url();
        // The API endpoint common to both KC and RM
        if (reqUrl.includes("/proxies/core-api/v1/quotes/get")) {
          try {
            interceptedJson = (await response.json()) as BarchartQuoteResponse;
          } catch {
            console.error("Failed to parse JSON response from Barchart.");
          }
        }
      });

      await page.goto(targetUrl, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      const headerText = await page.$eval('h1', (el) => el.innerText);

      // Regex to extract text inside parentheses at the end, e.g., "RMH26"
      const match = /\(((?:RM|KC)[A-Z0-9]+)\)/.exec(headerText);

      if (!match?.[1]) {
        throw new Error(`❌ Could not extract active symbol from header text: "${headerText}"`);
      }

      const activeSymbol = match[1]; // e.g., "RMH26"
      console.log(`🎯 Active Contract on Top: ${activeSymbol}`);

      // Wait for the specific response to be captured
      for (let i = 0; i < 75 && !interceptedJson; i++) {
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!interceptedJson) {
        console.error("Failed to fetch data from Barchart: No valid data received");
        return null;
      }

      const result = interceptedJson as BarchartQuoteResponse;

      const data = result.data.find((d: BarchartRaw) => d.symbol === activeSymbol);

      if (data) {
        return data;
      }

      return null;

    } catch (e) {
      console.error("Puppeteer error:", e);
      return null;
    } finally {
      await browser.close();
    }
  }

  /**
   * Generates MaDiscountValue records for a newly created MarketData record
   */
  private async _generateDiscountValues(marketData: MarketData) {
    // Only proceed if MA30 is available
    if (!marketData.ma30) return;

    console.log(`🔄 Generating discount values for MarketData ID: ${marketData.id}`);

    const settings = await db.maDiscountSetting.findMany({
      where: {
        commodity: marketData.type,
      },
    });

    for (const setting of settings) {
      // Check for existence
      const exists = await db.maDiscountValue.findUnique({
        where: {
          marketDataID_maDiscountSettingId: {
            marketDataID: marketData.id,
            maDiscountSettingId: setting.id,
          },
        },
      });

      if (exists) return;

      // Calculate values
      const ma30 = Number(marketData.ma30);
      const idrMa30 = Number(marketData.idrMa30);

      const discountedMa30 = ma30 - (ma30 * setting.discount) / 100;
      const discountedIdrMa30 = idrMa30 - (idrMa30 * setting.discount) / 100;

      // Calculate movement
      let discountedMa30Movement = 0;
      let discountedIdrMa30Movement = 0;

      // Find previous discount value
      const previousValue = await db.maDiscountValue.findFirst({
        where: {
          maDiscountSettingId: setting.id,
          marketData: {
            type: marketData.type,
            tradeDate: {
              lt: marketData.tradeDate,
            },
          },
        },
        orderBy: {
          marketData: {
            tradeDate: "desc",
          },
        },
      });

      if (previousValue) {
        discountedMa30Movement = discountedMa30 - previousValue.discountedMa30;
        discountedIdrMa30Movement =
          discountedIdrMa30 - previousValue.discountedIdrMa30;
      }

      await db.maDiscountValue.create({
        data: {
          type: setting.type,
          discountedMa30: Number(discountedMa30.toFixed(2)),
          discountedIdrMa30: Number(discountedIdrMa30.toFixed(2)),
          discountPercentage: setting.discount,
          marketDataID: marketData.id,
          maDiscountSettingId: setting.id,
          discountedMa30Movement: Number(discountedMa30Movement.toFixed(2)),
          discountedIdrMa30Movement: Number(
            discountedIdrMa30Movement.toFixed(2),
          ),
        },
      });
    }
    console.log(`✅ Generated ${settings.length} discount values.`);
  }

  /* ---------------------------------------
     PUBLIC SCRAPER METHODS
  ---------------------------------------- */

  public async scrapeKC(): Promise<number> {
    console.log("Starting KC (Arabica) Scrape...");
    const active = await this._fetchBarchartData(KC_URL);
    if (!active) {
      throw new Error('❌ No active contract found for KC.');
    }

    const tradeDate = `${active.raw.dailyDate1dAgo}T00:00:00.000Z`;

    console.log(tradeDate)

    const exists = await db.marketData.findFirst({
      where: {
        type: 'ARABICA',
        tradeDate: tradeDate
      }
    });

    if (exists) {
      throw new Error('KC (Arabica) already exists for this date.');
    }

    const IDR_BASE_RATE = await this.getIDRConversion();
    const IDR_RATE = IDR_BASE_RATE / 100 * LB_TO_KG;
    const prevData = await db.marketData.findMany({
      where: {
        type: 'ARABICA' // Assuming we want to filter by commodity
      },
      orderBy: {
        tradeDate: 'desc'
      },
      take: 30
    });

    // Calculate moving average with available data
    let ma30: number | null = null;
    const validPrices = prevData
      .map(d => Number(d.closePrice))
      .filter(price => !isNaN(price));

    if (validPrices.length > 0) {
      const sum = validPrices.reduce((acc, price) => acc + price, 0);
      ma30 = sum / validPrices.length;
      console.log(`📈 ${validPrices.length}-day MA: $${ma30.toFixed(4)}`);
    }

    let ma30Change = 0;
    if (ma30 !== null) {
      // Get the most recent MA30 value from the database
      const lastMa30Record = await db.marketData.findFirst({
        where: {
          type: 'ARABICA',
          ma30: { not: null }
        },
        orderBy: {
          tradeDate: 'desc'
        },
        select: {
          ma30: true
        }
      });

      const prevMa30 = lastMa30Record?.ma30 ? Number(lastMa30Record.ma30) : 0;
      ma30Change = ma30 - prevMa30;
    }

    const idrPrice = (Number(active.raw.dailyLastPrice) * IDR_RATE).toFixed(2);
    const idrPriceChange = (Number(active.raw.dailyPriceChange) * IDR_RATE).toFixed(2);
    const idrMa30Change = ma30Change * IDR_RATE;
    const idrMa30 = (ma30 ?? 0) * IDR_RATE;

    const previousClose = Number(active.raw.dailyPreviousPrice);
    const changePercent = previousClose !== 0 ? (Number(active.raw.dailyPriceChange) / previousClose) * 100 : 0;

     const marketData = await db.marketData.create({
      data: {
        type: 'ARABICA',
        tradeDate: tradeDate,
        openPrice: Number(active.raw.dailyOpenPrice).toFixed(2),
        highPrice: Number(active.raw.dailyHighPrice).toFixed(2),
        lowPrice: Number(active.raw.dailyLowPrice).toFixed(2),
        closePrice: Number(active.raw.dailyLastPrice).toFixed(2),
        priceChange: Number(active.raw.dailyPriceChange).toFixed(2),
        previousClose: Number(active.raw.dailyPreviousPrice).toFixed(2),
        changePercent: changePercent.toFixed(2),
        ma30: ma30,
        unitLabel: '¢/lb',
        volume: Number(active.raw.dailyVolume),
        openInterest: Number(active.raw.dailyOpenInterest),
        idrPrice: idrPrice,
        idrMa30: idrMa30,
        idrPriceChange: idrPriceChange,
        idrRate: IDR_BASE_RATE.toFixed(2),
        ma30Change: ma30Change.toFixed(2),
        idrMa30Change: idrMa30Change.toFixed(2),
      }
    });

    await this._generateDiscountValues(marketData);

    return 0;
  }

  public async scrapeRm(): Promise<number> {
    console.log("Starting RM (Robusta) Scrape...");
    const active = await this._fetchBarchartData(RM_URL);

    console.log('active:', active)

    if (!active) {
      throw new Error("❌ No JSON captured for RM.");
    }

    const tradeDateISO = `${active.raw.dailyDate1dAgo}T00:00:00.000Z`;

    const exists = await db.marketData.findFirst({
      where: {
        type: 'ROBUSTA',
        tradeDate: tradeDateISO
      }
    });

    if (exists) {
      throw new Error("❌ RM (Robusta) already exists for this date.");
    }

    const IDR_BASE_RATE = await this.getIDRConversion();
    const IDR_RATE = IDR_BASE_RATE / TONNE_TO_KG;
    const prevData = await db.marketData.findMany({
      where: {
        type: 'ROBUSTA' // Assuming we want to filter by commodity
      },
      orderBy: {
        tradeDate: 'desc'
      },
      take: 30
    });

    // Calculate moving average with available data
    let ma30: number | null = null;
    const validPrices = prevData
      .map(d => Number(d.closePrice))
      .filter(price => !isNaN(price));

    if (validPrices.length > 0) {
      const sum = validPrices.reduce((acc, price) => acc + price, 0);
      ma30 = sum / validPrices.length;
      console.log(`📈 ${validPrices.length}-day MA: $${ma30.toFixed(4)}`);
    }

    let ma30Change = 0;
    if (ma30 !== null) {
      // Get the most recent MA30 value from the database
      const lastMa30Record = await db.marketData.findFirst({
        where: {
          type: 'ROBUSTA',
          ma30: { not: null }
        },
        orderBy: {
          tradeDate: 'desc'
        },
        select: {
          ma30: true
        }
      });

      const prevMa30 = lastMa30Record?.ma30 ? Number(lastMa30Record.ma30) : 0;
      ma30Change = ma30 - prevMa30;
    }

    const idrPrice = (Number(active.raw.dailyLastPrice) * IDR_RATE).toFixed(2);
    const idrPriceChange = (Number(active.raw.dailyPriceChange) * IDR_RATE).toFixed(2);
    const idrMa30Change = ma30Change * IDR_RATE;
    const idrMa30 = (ma30 ?? 0) * IDR_RATE;

    const previousClose = Number(active.raw.dailyPreviousPrice);
    const changePercent = previousClose !== 0 ? (Number(active.raw.dailyPriceChange) / previousClose) * 100 : 0;

    console.log("openPrice", active.raw.dailyOpenPrice);

    const marketData = await db.marketData.create({
      data: {
        type: "ROBUSTA",
        tradeDate: tradeDateISO,
        openPrice: Number(active.raw.dailyOpenPrice).toFixed(2),
        highPrice: Number(active.raw.dailyHighPrice).toFixed(2),
        lowPrice: Number(active.raw.dailyLowPrice).toFixed(2),
        closePrice: Number(active.raw.dailyLastPrice).toFixed(2),
        priceChange: Number(active.raw.dailyPriceChange).toFixed(2),
        previousClose: Number(active.raw.dailyPreviousPrice).toFixed(2),
        changePercent: changePercent.toFixed(2),
        ma30: ma30,
        unitLabel: "USD/Tonne",
        volume: Number(active.raw.dailyVolume),
        openInterest: Number(active.raw.dailyOpenInterest),
        idrPrice: idrPrice,
        idrMa30: idrMa30,
        idrPriceChange: idrPriceChange,
        idrRate: IDR_BASE_RATE.toFixed(2),
        ma30Change: ma30Change.toFixed(2),
        idrMa30Change: idrMa30Change.toFixed(2),
      },
    });

    await this._generateDiscountValues(marketData);

    return 0;
  }
}
