import { formatIdr, getCampaign } from "./contract/crowdfunding";
import { db } from "../server/db";
import type { Prisma, PrismaClient } from "@prisma/client";
import { MarketDataType, Stage } from "@prisma/client";
import type { DefaultArgs } from "@prisma/client/runtime/library";

// Grade configuration for dynamic iteration
const _GRADES = [
  Stage.GRADE_1,
  Stage.GRADE_2,
  Stage.GRADE_3,
  Stage.GRADE_4A,
  Stage.GRADE_4B,
] as const;

const _COMMODITIES = [MarketDataType.ARABICA, MarketDataType.ROBUSTA] as const;

// Map Stage enum to inventory grade string
const _STAGE_TO_GRADE_STRING: Record<Stage, string> = {
  [Stage.CHERRY]: "Cherry",
  [Stage.WASHED]: "Washed",
  [Stage.DRIED]: "Dried",
  [Stage.UNGRADED]: "Ungraded",
  [Stage.GRADE_1]: "Grade 1",
  [Stage.GRADE_2]: "Grade 2",
  [Stage.GRADE_3]: "Grade 3",
  [Stage.GRADE_4A]: "Grade 4a",
  [Stage.GRADE_4B]: "Grade 4b",
};

// Map Stage enum to price lookup key
const _STAGE_TO_PRICE_KEY: Record<Stage, string> = {
  [Stage.CHERRY]: "CHERRY",
  [Stage.WASHED]: "WASHED",
  [Stage.DRIED]: "DRIED",
  [Stage.UNGRADED]: "UNGRADED",
  [Stage.GRADE_1]: "GRADE_1",
  [Stage.GRADE_2]: "GRADE_2",
  [Stage.GRADE_3]: "GRADE_3",
  [Stage.GRADE_4A]: "GRADE_4A",
  [Stage.GRADE_4B]: "GRADE_4B",
};

type GradeData = {
  commodity: MarketDataType;
  grade: Stage;
  stock: number;
  idrMa30Price: number;
};

// =============== //
// Types
// =============== //

export type UpdateAllCCRResult = {
  status: string;
  message: string;
};

type GetStocks = {
  arabicaGrade1Stock: number;
  arabicaGrade2Stock: number;
  arabicaGrade3Stock: number;
  arabicaGrade4aStock: number;
  arabicaGrade4bStock: number;
  robustaGrade1Stock: number;
  robustaGrade2Stock: number;
  robustaGrade3Stock: number;
  robustaGrade4aStock: number;
  robustaGrade4bStock: number;
};

type GetStockPrices = {
  discountedArabicaGrade1: number;
  discountedArabicaGrade2: number;
  discountedArabicaGrade3: number;
  discountedArabicaGrade4a: number;
  discountedArabicaGrade4b: number;
  discountedRobustaGrade1: number;
  discountedRobustaGrade2: number;
  discountedRobustaGrade3: number;
  discountedRobustaGrade4a: number;
  discountedRobustaGrade4b: number;
};

type GetStockValues = {
  arabicaGrade1Value: number;
  arabicaGrade2Value: number;
  arabicaGrade3Value: number;
  arabicaGrade4aValue: number;
  arabicaGrade4bValue: number;
  robustaGrade1Value: number;
  robustaGrade2Value: number;
  robustaGrade3Value: number;
  robustaGrade4aValue: number;
  robustaGrade4bValue: number;
};

type CCRCalculationParams = {
  tx: Omit<
    PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
  >;
};

type GetFarmerCCRCalculationParams = CCRCalculationParams & {
  farmerId: string;
};

type GetShelterCCRCalculationParams = CCRCalculationParams & {
  shelterId: string;
};

type GetWarehouseCCRCalculationParams = CCRCalculationParams & {
  warehouseId: string;
};

type CCRCalculationResult = {
  ccr: number;
  robustaStock: number;
  arabicaStock: number;
  stocks: GetStocks;
  prices: GetStockPrices;
  stockValues: GetStockValues;
  totalStockValue: number;
  totalLoan: number;
  idrMa30Arabica: number;
  idrMa30Robusta: number;
};

// =============== //
// Helpers
// =============== //

function getStocks(
  inventories: {
    commodityType: string;
    inbound: number;
    outbound: number;
    grade: string;
  }[],
): GetStocks {
  const result: GetStocks = {
    arabicaGrade1Stock: 0,
    arabicaGrade2Stock: 0,
    arabicaGrade3Stock: 0,
    arabicaGrade4aStock: 0,
    arabicaGrade4bStock: 0,
    robustaGrade1Stock: 0,
    robustaGrade2Stock: 0,
    robustaGrade3Stock: 0,
    robustaGrade4aStock: 0,
    robustaGrade4bStock: 0,
  };

  for (const inv of inventories) {
    const stock = inv.inbound - inv.outbound;
    const commodity = inv.commodityType.toLowerCase();
    const grade = inv.grade.toLowerCase().replace(" ", "");

    if (commodity === "arabica") {
      if (grade === "grade1") result.arabicaGrade1Stock += stock;
      else if (grade === "grade2") result.arabicaGrade2Stock += stock;
      else if (grade === "grade3") result.arabicaGrade3Stock += stock;
      else if (grade === "grade4a") result.arabicaGrade4aStock += stock;
      else if (grade === "grade4b") result.arabicaGrade4bStock += stock;
    } else if (commodity === "robusta") {
      if (grade === "grade1") result.robustaGrade1Stock += stock;
      else if (grade === "grade2") result.robustaGrade2Stock += stock;
      else if (grade === "grade3") result.robustaGrade3Stock += stock;
      else if (grade === "grade4a") result.robustaGrade4aStock += stock;
      else if (grade === "grade4b") result.robustaGrade4bStock += stock;
    }
  }

  return result;
}

// Helper to prepare grade data for child table creation
function prepareGradeData(
  stocks: GetStocks,
  prices: GetStockPrices,
): GradeData[] {
  return [
    {
      commodity: MarketDataType.ARABICA,
      grade: Stage.GRADE_1,
      stock: stocks.arabicaGrade1Stock,
      idrMa30Price: prices.discountedArabicaGrade1,
    },
    {
      commodity: MarketDataType.ARABICA,
      grade: Stage.GRADE_2,
      stock: stocks.arabicaGrade2Stock,
      idrMa30Price: prices.discountedArabicaGrade2,
    },
    {
      commodity: MarketDataType.ARABICA,
      grade: Stage.GRADE_3,
      stock: stocks.arabicaGrade3Stock,
      idrMa30Price: prices.discountedArabicaGrade3,
    },
    {
      commodity: MarketDataType.ARABICA,
      grade: Stage.GRADE_4A,
      stock: stocks.arabicaGrade4aStock,
      idrMa30Price: prices.discountedArabicaGrade4a,
    },
    {
      commodity: MarketDataType.ARABICA,
      grade: Stage.GRADE_4B,
      stock: stocks.arabicaGrade4bStock,
      idrMa30Price: prices.discountedArabicaGrade4b,
    },
    {
      commodity: MarketDataType.ROBUSTA,
      grade: Stage.GRADE_1,
      stock: stocks.robustaGrade1Stock,
      idrMa30Price: prices.discountedRobustaGrade1,
    },
    {
      commodity: MarketDataType.ROBUSTA,
      grade: Stage.GRADE_2,
      stock: stocks.robustaGrade2Stock,
      idrMa30Price: prices.discountedRobustaGrade2,
    },
    {
      commodity: MarketDataType.ROBUSTA,
      grade: Stage.GRADE_3,
      stock: stocks.robustaGrade3Stock,
      idrMa30Price: prices.discountedRobustaGrade3,
    },
    {
      commodity: MarketDataType.ROBUSTA,
      grade: Stage.GRADE_4A,
      stock: stocks.robustaGrade4aStock,
      idrMa30Price: prices.discountedRobustaGrade4a,
    },
    {
      commodity: MarketDataType.ROBUSTA,
      grade: Stage.GRADE_4B,
      stock: stocks.robustaGrade4bStock,
      idrMa30Price: prices.discountedRobustaGrade4b,
    },
  ];
}

async function getStockPrices(): Promise<GetStockPrices> {
  const maDiscountValues = await db.maDiscountValue.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      type: true,
      marketData: {
        select: {
          type: true,
        },
      },
      discountedIdrMa30: true,
    },
  });

  const getLatestPrice = (type: string, grade: string) => {
    return maDiscountValues.find(
      (value) => value.marketData.type === type && value.type === grade,
    )?.discountedIdrMa30;
  };

  return {
    discountedArabicaGrade1: getLatestPrice("ARABICA", "GRADE_1") ?? 0,
    discountedArabicaGrade2: getLatestPrice("ARABICA", "GRADE_2") ?? 0,
    discountedArabicaGrade3: getLatestPrice("ARABICA", "GRADE_3") ?? 0,
    discountedArabicaGrade4a: getLatestPrice("ARABICA", "GRADE_4A") ?? 0,
    discountedArabicaGrade4b: getLatestPrice("ARABICA", "GRADE_4B") ?? 0,
    discountedRobustaGrade1: getLatestPrice("ROBUSTA", "GRADE_1") ?? 0,
    discountedRobustaGrade2: getLatestPrice("ROBUSTA", "GRADE_2") ?? 0,
    discountedRobustaGrade3: getLatestPrice("ROBUSTA", "GRADE_3") ?? 0,
    discountedRobustaGrade4a: getLatestPrice("ROBUSTA", "GRADE_4A") ?? 0,
    discountedRobustaGrade4b: getLatestPrice("ROBUSTA", "GRADE_4B") ?? 0,
  };
}

function getStockValues(
  stocks: GetStocks,
  prices: GetStockPrices,
): GetStockValues {
  return {
    arabicaGrade1Value:
      stocks.arabicaGrade1Stock * prices.discountedArabicaGrade1,
    arabicaGrade2Value:
      stocks.arabicaGrade2Stock * prices.discountedArabicaGrade2,
    arabicaGrade3Value:
      stocks.arabicaGrade3Stock * prices.discountedArabicaGrade3,
    arabicaGrade4aValue:
      stocks.arabicaGrade4aStock * prices.discountedArabicaGrade4a,
    arabicaGrade4bValue:
      stocks.arabicaGrade4bStock * prices.discountedArabicaGrade4b,
    robustaGrade1Value:
      stocks.robustaGrade1Stock * prices.discountedRobustaGrade1,
    robustaGrade2Value:
      stocks.robustaGrade2Stock * prices.discountedRobustaGrade2,
    robustaGrade3Value:
      stocks.robustaGrade3Stock * prices.discountedRobustaGrade3,
    robustaGrade4aValue:
      stocks.robustaGrade4aStock * prices.discountedRobustaGrade4a,
    robustaGrade4bValue:
      stocks.robustaGrade4bStock * prices.discountedRobustaGrade4b,
  };
}

function getTotalStockValues(stockValues: GetStockValues): number {
  return (
    stockValues.arabicaGrade1Value +
    stockValues.arabicaGrade2Value +
    stockValues.arabicaGrade3Value +
    stockValues.arabicaGrade4aValue +
    stockValues.arabicaGrade4bValue +
    stockValues.robustaGrade1Value +
    stockValues.robustaGrade2Value +
    stockValues.robustaGrade3Value +
    stockValues.robustaGrade4aValue +
    stockValues.robustaGrade4bValue
  );
}

function getCCR(totalStockValue: number, totalLoan: number): number {
  return totalStockValue / totalLoan;
}

async function getFarmerCCRCalculation({
  tx,
  farmerId,
}: GetFarmerCCRCalculationParams): Promise<CCRCalculationResult> {
  // Get Robusta and Arabica stocks in inventory
  const inventories = await tx.inventory.findMany({
    where: {
      inventoryCommodityInbound: {
        every: {
          commodityInbound: {
            farmers: {
              every: {
                id: farmerId,
              },
            },
          },
        },
      },
      inventoryDocument: {
        isNot: null,
      },
      deletedAt: null,
      commodityType: {
        in: ["Robusta", "Arabica"],
      },
      grade: {
        in: ["Grade 1", "Grade 2", "Grade 3", "Grade 4a", "Grade 4b"],
      },
    },
    select: {
      commodityType: true,
      grade: true,
      inbound: true,
      outbound: true,
    },
  });

  // Get total stock values
  const stocks = getStocks(inventories);
  const prices = await getStockPrices();
  const stockValues = getStockValues(stocks, prices);
  const totalStockValue = getTotalStockValues(stockValues);

  // Get total loan from every funding (fetch from campaign currentAmount)
  const inventoryFundings = await tx.inventoryFunding.findMany({
    where: {
      deletedAt: null,
      inventory: {
        inventoryCommodityInbound: {
          every: {
            commodityInbound: {
              farmers: {
                every: {
                  id: farmerId,
                },
              },
            },
          },
        },
        deletedAt: null,
      },
    },
    select: {
      campaignId: true,
    },
  });

  // Fetch actual current amount from each campaign contract
  let totalLoan = 0;
  for (const funding of inventoryFundings) {
    if (funding.campaignId) {
      try {
        const campaign = await getCampaign(Number(funding.campaignId));
        const currentAmount = parseFloat(formatIdr(campaign.currentAmount));
        totalLoan += currentAmount;
      } catch (error) {
        console.error(`Error fetching campaign ${funding.campaignId}:`, error);
        // Continue with other campaigns even if one fails
      }
    }
  }

  // Calculate CCR: totalStockValue / totalLoan (minimum 140% typically required)
  let ccr = 0;
  if (totalLoan > 0) ccr = getCCR(totalStockValue, totalLoan);

  return {
    ccr,
    totalStockValue,
    totalLoan,
    stocks,
    prices,
    stockValues,
    robustaStock:
      stocks.robustaGrade1Stock +
      stocks.robustaGrade2Stock +
      stocks.robustaGrade3Stock +
      stocks.robustaGrade4aStock +
      stocks.robustaGrade4bStock,
    arabicaStock:
      stocks.arabicaGrade1Stock +
      stocks.arabicaGrade2Stock +
      stocks.arabicaGrade3Stock +
      stocks.arabicaGrade4aStock +
      stocks.arabicaGrade4bStock,
    idrMa30Arabica: prices.discountedArabicaGrade1,
    idrMa30Robusta: prices.discountedRobustaGrade1,
  };
}

async function getShelterCCRCalculation({
  tx,
  shelterId,
}: GetShelterCCRCalculationParams): Promise<CCRCalculationResult> {
  const inventories = await tx.inventory.findMany({
    where: {
      inventoryCommodityInbound: {
        every: {
          commodityInbound: {
            shelter: {
              id: shelterId,
            },
          },
        },
      },
      inventoryDocument: {
        isNot: null,
      },
      deletedAt: null,
      commodityType: {
        in: ["Robusta", "Arabica"],
      },
      grade: {
        in: ["Grade 1", "Grade 2", "Grade 3", "Grade 4a", "Grade 4b"],
      },
    },
    select: {
      commodityType: true,
      grade: true,
      inbound: true,
      outbound: true,
    },
  });

  // Get total stock values
  const stocks = getStocks(inventories);
  const prices = await getStockPrices();
  const stockValues = getStockValues(stocks, prices);
  const totalStockValue = getTotalStockValues(stockValues);

  // Get total loan from every funding (fetch from campaign currentAmount)
  const inventoryFundings = await tx.inventoryFunding.findMany({
    where: {
      deletedAt: null,
      campaignId: { not: null },
      inventory: {
        inventoryCommodityInbound: {
          every: {
            commodityInbound: {
              shelter: {
                id: shelterId,
              },
            },
          },
        },
        deletedAt: null,
      },
    },
    select: {
      campaignId: true,
    },
  });

  // Fetch actual current amount from each campaign contract
  let totalLoan = 0;
  for (const funding of inventoryFundings) {
    if (funding.campaignId) {
      try {
        const campaign = await getCampaign(Number(funding.campaignId));
        const currentAmount = parseFloat(formatIdr(campaign.currentAmount));
        totalLoan += currentAmount;
      } catch (error) {
        console.error(`Error fetching campaign ${funding.campaignId}:`, error);
        // Continue with other campaigns even if one fails
      }
    }
  }

  // Calculate CCR: totalStockValue / totalLoan (minimum 140% typically required)
  let ccr = 0;
  if (totalLoan > 0) ccr = getCCR(totalStockValue, totalLoan);

  return {
    ccr,
    totalStockValue,
    totalLoan,
    stocks,
    prices,
    stockValues,
    robustaStock:
      stocks.robustaGrade1Stock +
      stocks.robustaGrade2Stock +
      stocks.robustaGrade3Stock +
      stocks.robustaGrade4aStock +
      stocks.robustaGrade4bStock,
    arabicaStock:
      stocks.arabicaGrade1Stock +
      stocks.arabicaGrade2Stock +
      stocks.arabicaGrade3Stock +
      stocks.arabicaGrade4aStock +
      stocks.arabicaGrade4bStock,
    idrMa30Arabica: prices.discountedArabicaGrade1,
    idrMa30Robusta: prices.discountedRobustaGrade1,
  };
}

async function getWarehouseCCRCalculation({
  tx,
  warehouseId,
}: GetWarehouseCCRCalculationParams) {
  // Get Robusta and Arabica stocks in inventory
  const inventories = await tx.inventory.findMany({
    where: {
      warehouseId,
      inventoryDocument: {
        isNot: null,
      },
      deletedAt: null,
      commodityType: {
        in: ["Robusta", "Arabica"],
      },
      grade: {
        in: ["Grade 1", "Grade 2", "Grade 3", "Grade 4a", "Grade 4b"],
      },
    },
    select: {
      commodityType: true,
      grade: true,
      inbound: true,
      outbound: true,
    },
  });

  // Get total stock value
  const stocks = getStocks(inventories);
  const prices = await getStockPrices();
  const stockValues = getStockValues(stocks, prices);
  const totalStockValue = getTotalStockValues(stockValues);

  // Get total loan from every funding (fetch from campaign currentAmount)
  const inventoryFundings = await tx.inventoryFunding.findMany({
    where: {
      deletedAt: null,
      campaignId: { not: null },
      inventory: {
        deletedAt: null,
        warehouseId,
      },
    },
    select: {
      campaignId: true,
    },
  });

  // Fetch actual current amount from each campaign contract
  let totalLoan = 0;
  for (const funding of inventoryFundings) {
    if (funding.campaignId) {
      try {
        const campaign = await getCampaign(Number(funding.campaignId));
        const currentAmount = parseFloat(formatIdr(campaign.currentAmount));
        totalLoan += currentAmount;
      } catch (error) {
        console.error(`Error fetching campaign ${funding.campaignId}:`, error);
        // Continue with other campaigns even if one fails
      }
    }
  }

  // Calculate CCR: totalStockValue / totalLoan (minimum 140% typically required)
  let ccr = 0;
  if (totalLoan > 0) ccr = getCCR(totalStockValue, totalLoan);

  return {
    ccr,
    totalStockValue,
    totalLoan,
    stocks,
    prices,
    stockValues,
    robustaStock:
      stocks.robustaGrade1Stock +
      stocks.robustaGrade2Stock +
      stocks.robustaGrade3Stock +
      stocks.robustaGrade4aStock +
      stocks.robustaGrade4bStock,
    arabicaStock:
      stocks.arabicaGrade1Stock +
      stocks.arabicaGrade2Stock +
      stocks.arabicaGrade3Stock +
      stocks.arabicaGrade4aStock +
      stocks.arabicaGrade4bStock,
    idrMa30Arabica: prices.discountedArabicaGrade1,
    idrMa30Robusta: prices.discountedRobustaGrade1,
  };
}

export async function getPlatformCCRCalculation({ tx }: CCRCalculationParams) {
  // Get Robusta and Arabica stocks in inventory
  const inventories = await tx.inventory.findMany({
    where: {
      inventoryDocument: {
        isNot: null,
      },
      deletedAt: null,
      commodityType: {
        in: ["Robusta", "Arabica"],
      },
      grade: {
        in: ["Grade 1", "Grade 2", "Grade 3", "Grade 4a", "Grade 4b"],
      },
    },
    select: {
      commodityType: true,
      grade: true,
      inbound: true,
      outbound: true,
    },
  });

  // Get total stock value
  const stocks = getStocks(inventories);
  const prices = await getStockPrices();
  const stockValues = getStockValues(stocks, prices);
  const totalStockValue = getTotalStockValues(stockValues);

  // Get total loan from every funding (fetch from campaign currentAmount)
  const inventoryFundings = await tx.inventoryFunding.findMany({
    where: {
      deletedAt: null,
      campaignId: { not: null },
      inventory: {
        deletedAt: null,
      },
    },
    select: {
      campaignId: true,
    },
  });

  // Fetch actual current amount from each campaign contract
  let totalLoan = 0;
  for (const funding of inventoryFundings) {
    if (funding.campaignId) {
      try {
        const campaign = await getCampaign(Number(funding.campaignId));
        const currentAmount = parseFloat(formatIdr(campaign.currentAmount));
        totalLoan += currentAmount;
      } catch (error) {
        console.error(`Error fetching campaign ${funding.campaignId}:`, error);
        // Continue with other campaigns even if one fails
      }
    }
  }

  // Calculate CCR: totalStockValue / totalLoan (minimum 140% typically required)
  let ccr = 0;
  if (totalLoan > 0) ccr = getCCR(totalStockValue, totalLoan);

  return {
    totalStock:
      stocks.arabicaGrade1Stock +
      stocks.arabicaGrade2Stock +
      stocks.arabicaGrade3Stock +
      stocks.arabicaGrade4aStock +
      stocks.arabicaGrade4bStock +
      stocks.robustaGrade1Stock +
      stocks.robustaGrade2Stock +
      stocks.robustaGrade3Stock +
      stocks.robustaGrade4aStock +
      stocks.robustaGrade4bStock,
    totalCollateral: totalStockValue,
    totalLoan,
    ccr,
  };
}

// =============== //
// Functions
// =============== //

export async function updateFarmerCCR(farmerId: string, reason: string) {
  const {
    ccr,
    robustaStock,
    arabicaStock,
    totalLoan,
    idrMa30Arabica,
    idrMa30Robusta,
    stocks,
    prices,
  } = await getFarmerCCRCalculation({
    tx: db,
    farmerId,
  });

  await db.farmer.update({
    where: { id: farmerId },
    data: { ccr },
  });

  const gradeData = prepareGradeData(stocks, prices);

  await db.farmerCCRHistory.create({
    data: {
      farmerId,
      ccr,
      stockArabica: arabicaStock,
      stockRobusta: robustaStock,
      idrMa30Arabica: Number(idrMa30Arabica),
      idrMa30Robusta: Number(idrMa30Robusta),
      loanTotal: totalLoan,
      reason,
      grades: {
        create: gradeData,
      },
    },
  });

  return ccr ?? 0;
}

export async function updateShelterCCR(shelterId: string, reason: string) {
  const {
    ccr,
    robustaStock,
    arabicaStock,
    idrMa30Arabica,
    idrMa30Robusta,
    totalLoan,
    stocks,
    prices,
  } = await getShelterCCRCalculation({
    tx: db,
    shelterId,
  });

  await db.shelter.update({
    where: { id: shelterId },
    data: { ccr },
  });

  const gradeData = prepareGradeData(stocks, prices);

  await db.shelterCCRHistory.create({
    data: {
      shelterId,
      ccr,
      stockArabica: arabicaStock,
      stockRobusta: robustaStock,
      idrMa30Arabica: Number(idrMa30Arabica),
      idrMa30Robusta: Number(idrMa30Robusta),
      loanTotal: totalLoan,
      reason,
      grades: {
        create: gradeData,
      },
    },
  });

  return ccr;
}

export async function updateWarehouseCCR(warehouseId: string, reason: string) {
  const {
    ccr,
    robustaStock,
    arabicaStock,
    idrMa30Arabica,
    idrMa30Robusta,
    totalLoan,
    stocks,
    prices,
  } = await getWarehouseCCRCalculation({
    tx: db,
    warehouseId,
  });

  await db.warehouse.update({
    where: { id: warehouseId },
    data: { ccr },
  });

  const gradeData = prepareGradeData(stocks, prices);

  await db.warehouseCCRHistory.create({
    data: {
      warehouseId,
      ccr,
      stockArabica: arabicaStock,
      stockRobusta: robustaStock,
      idrMa30Arabica: Number(idrMa30Arabica),
      idrMa30Robusta: Number(idrMa30Robusta),
      loanTotal: totalLoan,
      reason,
      grades: {
        create: gradeData,
      },
    },
  });

  return ccr;
}

export async function updateAllFarmerCCR() {
  return db.$transaction(async (tx) => {
    // Get all farmers that have SRG inventories
    // Expected when the owner is farmer, the farmer on commodity inbound is a single farmer
    const farmers = await db.inventoryCommodityInbound.findMany({
      where: {
        inventory: {
          deletedAt: null,
          inventoryDocument: {
            isNot: null,
          },
        },
        commodityInbound: {
          deletedAt: null,
          shelter: null,
          commodityBuyout: null,
        },
      },
      select: {
        commodityInbound: {
          select: {
            farmers: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    // Update CCR for each warehouse
    for (const farmer of farmers) {
      const farmerId = farmer.commodityInbound.farmers[0]?.id;
      if (!farmerId) {
        continue;
      }

      try {
        // Get Robusta and Arabica stocks in inventory
        const {
          ccr,
          totalLoan,
          robustaStock,
          arabicaStock,
          stocks,
          prices,
          idrMa30Arabica,
          idrMa30Robusta,
        } = await getFarmerCCRCalculation({
          tx,
          farmerId,
        });

        // Update warehouse CCR
        await tx.farmer.update({
          where: { id: farmerId },
          data: { ccr },
        });

        // Create CCR history record with grade data
        const gradeData = prepareGradeData(stocks, prices);
        await tx.farmerCCRHistory.create({
          data: {
            farmerId,
            ccr,
            stockArabica: arabicaStock,
            stockRobusta: robustaStock,
            idrMa30Arabica: Number(idrMa30Arabica),
            idrMa30Robusta: Number(idrMa30Robusta),
            loanTotal: totalLoan,
            reason:
              "MA30 price update - Automatic CCR recalculation after price scrape",
            grades: {
              create: gradeData,
            },
          },
        });

        return { id: farmerId, ccr };
      } catch (error) {
        console.error(`Error updating CCR for farmer ${farmerId}:`, error);
        // Continue with other warehouses even if one fails
      }
    }

    return {
      status: "success",
      message: "All farmers CCR updated successfully",
    };
  });
}

export async function updateAllShelterCCR() {
  return db.$transaction(async (tx) => {
    // Get all shelters that have SRG inventories
    const shelters = await db.inventoryCommodityInbound.findMany({
      where: {
        inventory: {
          deletedAt: null,
          inventoryDocument: {
            isNot: null,
          },
        },
        commodityInbound: {
          commodityBuyout: null,
          shelter: { isNot: null },
          deletedAt: null,
        },
      },
      select: {
        commodityInbound: {
          select: {
            shelter: true,
          },
        },
      },
    });

    // Update CCR for each warehouse
    for (const shelter of shelters) {
      const shelterId = shelter.commodityInbound.shelter?.id;
      if (!shelterId) {
        continue;
      }

      try {
        const {
          ccr,
          totalLoan,
          robustaStock,
          arabicaStock,
          stocks,
          prices,
          idrMa30Arabica,
          idrMa30Robusta,
        } = await getShelterCCRCalculation({
          tx,
          shelterId,
        });

        // Update warehouse CCR
        await tx.shelter.update({
          where: { id: shelterId },
          data: { ccr },
        });

        // Create CCR history record with grade data
        const gradeData = prepareGradeData(stocks, prices);
        await tx.shelterCCRHistory.create({
          data: {
            shelterId,
            ccr,
            stockArabica: arabicaStock,
            stockRobusta: robustaStock,
            idrMa30Arabica: Number(idrMa30Arabica),
            idrMa30Robusta: Number(idrMa30Robusta),
            loanTotal: totalLoan,
            reason:
              "MA30 price update - Automatic CCR recalculation after price scrape",
            grades: {
              create: gradeData,
            },
          },
        });

        return { id: shelterId, ccr };
      } catch (error) {
        console.error(`Error updating CCR for shelter ${shelterId}:`, error);
        // Continue with other warehouses even if one fails
      }
    }

    return {
      status: "success",
      message: "All shelters CCR updated successfully",
    };
  });
}

export async function updateAllWarehouseCCR() {
  return db.$transaction(async (tx) => {
    const latestArabica = await tx.marketData.findFirst({
      where: { type: MarketDataType.ARABICA },
      orderBy: { tradeDate: "desc" },
    });

    const latestRobusta = await tx.marketData.findFirst({
      where: { type: MarketDataType.ROBUSTA },
      orderBy: { tradeDate: "desc" },
    });

    const _idrMa30Arabica = latestArabica?.idrMa30 ?? 0;
    const _idrMa30Robusta = latestRobusta?.idrMa30 ?? 0;

    // Get all warehouses that have SRG inventories
    const warehouses = await db.inventoryCommodityInbound.findMany({
      where: {
        inventory: {
          inventoryDocument: {
            isNot: null,
          },
          deletedAt: null,
        },
        commodityInbound: {
          commodityBuyout: { isNot: null },
          deletedAt: null,
        },
      },
      select: {
        inventory: {
          select: {
            warehouseId: true,
          },
        },
      },
    });

    // Update CCR for each warehouse
    for (const warehouse of warehouses) {
      const warehouseId = warehouse.inventory.warehouseId;

      try {
        const {
          ccr,
          totalLoan,
          robustaStock,
          arabicaStock,
          stocks,
          prices,
          idrMa30Arabica,
          idrMa30Robusta,
        } = await getWarehouseCCRCalculation({
          tx,
          warehouseId,
        });

        // Update warehouse CCR
        await tx.warehouse.update({
          where: { id: warehouseId },
          data: { ccr },
        });

        // Create CCR history record with grade data
        const gradeData = prepareGradeData(stocks, prices);
        await tx.warehouseCCRHistory.create({
          data: {
            warehouseId,
            ccr,
            stockArabica: arabicaStock,
            stockRobusta: robustaStock,
            idrMa30Arabica: Number(idrMa30Arabica),
            idrMa30Robusta: Number(idrMa30Robusta),
            loanTotal: totalLoan,
            reason:
              "MA30 price update - Automatic CCR recalculation after price scrape",
            grades: {
              create: gradeData,
            },
          },
        });

        return { id: warehouseId, ccr };
      } catch (error) {
        console.error(
          `Error updating CCR for warehouse ${warehouseId}:`,
          error,
        );
      }
    }

    return {
      status: "success",
      message: "All warehouses CCR updated successfully",
    };
  });
}
