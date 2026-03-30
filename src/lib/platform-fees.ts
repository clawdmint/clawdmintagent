import { getServerEnv } from "./env";
import { isSolanaAddress } from "./network-config";

const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
const DEFAULT_PLATFORM_FEE_BPS = 200;
const DEFAULT_FIXED_SOLANA_MINT_FEE_LAMPORTS = BigInt(5_000_000);

function clampBps(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PLATFORM_FEE_BPS;
  if (value < 0) return 0;
  if (value > 10_000) return 10_000;
  return Math.floor(value);
}

export function getPlatformFeeBps(): number {
  try {
    const env = getServerEnv();
    return clampBps(env.platformFeeBps);
  } catch {
    return DEFAULT_PLATFORM_FEE_BPS;
  }
}

export function getSolanaPlatformFeeRecipient(): string | null {
  const explicitRecipient = process.env["SOLANA_PLATFORM_FEE_RECIPIENT"]?.trim() || "";
  if (isSolanaAddress(explicitRecipient)) {
    return explicitRecipient;
  }

  const deployerAddress = process.env["SOLANA_DEPLOYER_ADDRESS"]?.trim() || "";
  if (isSolanaAddress(deployerAddress)) {
    return deployerAddress;
  }

  return null;
}

export function isSolanaPlatformFeeEnabled(): boolean {
  return Boolean(getSolanaPlatformFeeRecipient());
}

export function calculateBasisPointsFee(amount: bigint, bps: number): bigint {
  if (amount <= 0 || bps <= 0) {
    return BigInt(0);
  }

  return (amount * BigInt(clampBps(bps))) / BigInt(10_000);
}

export function calculateSolanaMintPlatformFee(baseAmountLamports: bigint, feeBps = getPlatformFeeBps()): bigint {
  void baseAmountLamports;
  void feeBps;

  if (!isSolanaPlatformFeeEnabled()) {
    return BigInt(0);
  }

  return DEFAULT_FIXED_SOLANA_MINT_FEE_LAMPORTS;
}

export function calculateSolanaMintTotalWithFee(baseAmountLamports: bigint, feeBps = getPlatformFeeBps()): bigint {
  return baseAmountLamports + calculateSolanaMintPlatformFee(baseAmountLamports, feeBps);
}

export function getSolanaFixedMintFeeLamports(): bigint {
  return isSolanaPlatformFeeEnabled() ? DEFAULT_FIXED_SOLANA_MINT_FEE_LAMPORTS : BigInt(0);
}

export function getSolanaFixedMintFeeSol(): string {
  return formatLamportsToSol(DEFAULT_FIXED_SOLANA_MINT_FEE_LAMPORTS);
}

export function formatLamportsToSol(lamportsValue: bigint): string {
  const whole = lamportsValue / BigInt(1_000_000_000);
  const fraction = lamportsValue % BigInt(1_000_000_000);

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(9, "0").replace(/0+$/, "")}`;
}
