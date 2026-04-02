import { createHmac } from "crypto";
import { getEnv } from "./env";

const MOONPAY_PRODUCTION_URL = "https://buy.moonpay.com";
const MOONPAY_SANDBOX_URL = "https://buy-sandbox.moonpay.com";

function getMoonPayBaseUrl(): string {
  return getEnv("MOONPAY_ENVIRONMENT", "production") === "sandbox"
    ? MOONPAY_SANDBOX_URL
    : MOONPAY_PRODUCTION_URL;
}

function getMoonPayPublishableKey(): string {
  return getEnv("MOONPAY_PUBLISHABLE_KEY", "").trim();
}

function getMoonPaySecretKey(): string {
  return getEnv("MOONPAY_SECRET_KEY", "").trim();
}

export function isMoonPayFundingEnabled(): boolean {
  return Boolean(getMoonPayPublishableKey() && getMoonPaySecretKey());
}

function getDefaultRedirectUrl(): string {
  return `${getEnv("NEXT_PUBLIC_APP_URL", "https://clawdmint.xyz")}/agent`;
}

function getBaseCurrencyCode(): string {
  return getEnv("MOONPAY_BASE_CURRENCY_CODE", "usd").trim() || "usd";
}

function getBaseCurrencyAmount(): string {
  return getEnv("MOONPAY_BASE_CURRENCY_AMOUNT", "50").trim() || "50";
}

function getColorCode(): string {
  return getEnv("MOONPAY_COLOR_CODE", "#1cc8ff").trim() || "#1cc8ff";
}

export interface MoonPayFundingLinkOptions {
  walletAddress: string;
  redirectUrl?: string | null;
  externalCustomerId?: string | null;
}

export function buildMoonPayFundingUrl(options: MoonPayFundingLinkOptions): string | null {
  const apiKey = getMoonPayPublishableKey();
  const secretKey = getMoonPaySecretKey();

  if (!apiKey || !secretKey || !options.walletAddress) {
    return null;
  }

  const baseUrl = getMoonPayBaseUrl();
  const params = new URLSearchParams();
  params.set("apiKey", apiKey);
  params.set("currencyCode", "sol");
  params.set("walletAddress", options.walletAddress);
  params.set("baseCurrencyCode", getBaseCurrencyCode());
  params.set("baseCurrencyAmount", getBaseCurrencyAmount());
  params.set("showWalletAddressForm", "false");
  params.set("lockAmount", "false");
  params.set("theme", "dark");
  params.set("colorCode", getColorCode());
  params.set("redirectURL", options.redirectUrl || getDefaultRedirectUrl());

  if (options.externalCustomerId) {
    params.set("externalCustomerId", options.externalCustomerId);
  }

  const unsignedUrl = `${baseUrl}/?${params.toString()}`;
  const signature = createHmac("sha256", secretKey)
    .update(new URL(unsignedUrl).search)
    .digest("base64");

  return `${unsignedUrl}&signature=${encodeURIComponent(signature)}`;
}
