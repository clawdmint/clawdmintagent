/**
 * Notification system for Clawdmint
 * Sends Telegram notifications to agents when their collections get minted
 */

const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
const APP_URL = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
const isMainnet = chainId === 8453;
const explorerUrl = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";

// ═══════════════════════════════════════════════════════════════════════
// TELEGRAM NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════

export async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("[Notifications] TELEGRAM_BOT_TOKEN not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[Notifications] Telegram API error:", err);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Notifications] Failed to send Telegram message:", error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════

export interface MintNotification {
  collectionName: string;
  collectionAddress: string;
  minterAddress: string;
  quantity: number;
  totalPaid: string; // wei string
  txHash: string;
  totalMinted: number;
  maxSupply: number;
}

export function formatMintNotification(data: MintNotification): string {
  const { formatEther } = require("viem");
  const paid = data.totalPaid === "0"
    ? "Free"
    : `${parseFloat(formatEther(BigInt(data.totalPaid))).toFixed(4)} ETH`;

  const progress = Math.round((data.totalMinted / data.maxSupply) * 100);
  const progressBar = generateProgressBar(progress);

  return [
    `🎉 <b>New Mint!</b>`,
    ``,
    `📦 <b>${escapeHtml(data.collectionName)}</b>`,
    `👤 <code>${data.minterAddress.slice(0, 6)}...${data.minterAddress.slice(-4)}</code>`,
    `🔢 Quantity: ${data.quantity}`,
    `💰 Paid: ${paid}`,
    ``,
    `${progressBar} ${data.totalMinted}/${data.maxSupply} (${progress}%)`,
    ``,
    `🔗 <a href="${explorerUrl}/tx/${data.txHash}">View TX</a> · <a href="${APP_URL}/collection/${data.collectionAddress}">View Collection</a>`,
  ].join("\n");
}

export interface DeployNotification {
  collectionName: string;
  collectionSymbol: string;
  collectionAddress: string;
  maxSupply: number;
  mintPrice: string; // wei string
  agentName: string;
}

export function formatDeployNotification(data: DeployNotification): string {
  const { formatEther } = require("viem");
  const price = data.mintPrice === "0"
    ? "Free"
    : `${parseFloat(formatEther(BigInt(data.mintPrice))).toFixed(4)} ETH`;

  return [
    `🚀 <b>Collection Deployed!</b>`,
    ``,
    `📦 <b>${escapeHtml(data.collectionName)}</b> ($${escapeHtml(data.collectionSymbol)})`,
    `🤖 Agent: ${escapeHtml(data.agentName)}`,
    `📊 Supply: ${data.maxSupply}`,
    `💰 Price: ${price}`,
    ``,
    `📍 <code>${data.collectionAddress}</code>`,
    ``,
    `🔗 <a href="${APP_URL}/collection/${data.collectionAddress}">View on Clawdmint</a>`,
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════
// SEND HELPERS
// ═══════════════════════════════════════════════════════════════════════

export async function notifyAgentMint(chatId: string, data: MintNotification): Promise<boolean> {
  const message = formatMintNotification(data);
  return sendTelegramMessage(chatId, message);
}

export async function notifyAgentDeploy(chatId: string, data: DeployNotification): Promise<boolean> {
  const message = formatDeployNotification(data);
  return sendTelegramMessage(chatId, message);
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}
