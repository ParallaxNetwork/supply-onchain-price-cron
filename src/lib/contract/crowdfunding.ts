import { Contract, ethers } from "ethers";
import { getNetworkUrl } from "../network";
import { abi } from "./abi";

const provider = new ethers.JsonRpcProvider(getNetworkUrl());

// ============================================================================
// Constants
// ============================================================================

export const IDR_DECIMALS = 6;

export enum CampaignStatus {
  Active = 0,
  FundingFailed = 1,
  PendingSignOff = 2,
  LoanActive = 3,
  Repaid = 4,
  Defaulted = 5,
  Cancelled = 6,
  Completed = 7,
}

// ============================================================================
// Types
// ============================================================================

export interface CampaignData {
  srgTokenId: bigint;
  srgTokenContract: string;
  borrower: string;
  targetAmount: bigint;
  currentAmount: bigint;
  createdAt: bigint;
  fundingDeadline: bigint;
  interestRateBps: bigint;
  loanStartTime: bigint;
  maxPayoutDate: bigint;
  totalRepaymentAmount: bigint;
  status: CampaignStatus;
  originalSrgOwner: string;
  adminFeePercentage: bigint;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Converts IDR amount from contract format to human-readable string
 */
export function formatIdr(amount: bigint): string {
  return ethers.formatUnits(amount, IDR_DECIMALS);
}

/**
 * Get campaign by ID.
 * Parses the raw contract tuple into a named CampaignData object.
 */
export async function getCampaign(campaignId: number): Promise<CampaignData> {
  try {
    if (!process.env.SRG_CROWDFUNDING_CONTRACT) {
      throw new Error("SRG_CROWDFUNDING_CONTRACT environment variable is not set");
    }

    const crowdfundingContract = new Contract(
      process.env.SRG_CROWDFUNDING_CONTRACT,
      abi.SRGCrowdfunding,
      provider,
    );

    const raw = await (
      crowdfundingContract as Contract & {
        getCampaign: (campaignId: number) => Promise<unknown[]>;
      }
    ).getCampaign(campaignId);

    return {
      srgTokenId: BigInt(raw[0] as string),
      srgTokenContract: raw[1] as string,
      borrower: raw[2] as string,
      targetAmount: BigInt(raw[3] as string),
      currentAmount: BigInt(raw[4] as string),
      createdAt: BigInt(raw[5] as string),
      fundingDeadline: BigInt(raw[6] as string),
      interestRateBps: BigInt(raw[7] as string),
      loanStartTime: BigInt(raw[8] as string),
      maxPayoutDate: BigInt(raw[9] as string),
      totalRepaymentAmount: BigInt(raw[10] as string),
      status: Number(raw[11]) as CampaignStatus,
      originalSrgOwner: raw[12] as string,
      adminFeePercentage: raw[13] != null ? BigInt(raw[13] as string) : 0n,
    };
  } catch (error) {
    console.error("Error getting campaign:", error);
    throw error;
  }
}
