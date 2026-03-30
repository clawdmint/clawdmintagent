import { getServerEnv } from "./env";
import { isSolanaAddress } from "./network-config";

const DEFAULT_PLATFORM_FEE_BPS = 200;

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
  return getPlatformFeeBps() > 0 && Boolean(getSolanaPlatformFeeRecipient());
}

export function calculateBasisPointsFee(amount: bigint, bps: number): bigint {
  if (amount <= 0 || bps <= 0) {
    return BigInt(0);
  }

  return (amount * BigInt(clampBps(bps))) / BigInt(10_000);
}

export function calculateSolanaMintPlatformFee(baseAmountLamports: bigint, feeBps = getPlatformFeeBps()): bigint {
  if (!isSolanaPlatformFeeEnabled() || feeBps <= 0) {
    return BigInt(0);
  }

  return calculateBasisPointsFee(baseAmountLamports, feeBps);
}

export function calculateSolanaMintTotalWithFee(baseAmountLamports: bigint, feeBps = getPlatformFeeBps()): bigint {
  return baseAmountLamports + calculateSolanaMintPlatformFee(baseAmountLamports, feeBps);
}

export function formatLamportsToSol(lamportsValue: bigint): string {
  const whole = lamportsValue / BigInt(1_000_000_000);
  const fraction = lamportsValue % BigInt(1_000_000_000);

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(9, "0").replace(/0+$/, "")}`;
}
