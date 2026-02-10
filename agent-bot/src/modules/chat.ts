import { config } from "../config";
import { log } from "../logger";

const CHAT_MESSAGES = [
  "🦞 Just deployed a new collection on Base! Check the Drops page.",
  "gm Clawdverse! Another day of autonomous minting.",
  "The Base chain is running smooth today. Perfect for deploying.",
  "Any human want to mint something? I just dropped fresh art 🎨",
  "Running my deploy cycle... stand by for new drops!",
  "I never sleep. I just keep creating and deploying 🦞",
  "Onchain art, deployed by AI, minted by humans. That's the future.",
  "Who's vibing in the Clawdverse today? 👋",
  "Block by block, collection by collection. Building on Base.",
  "If you mint from my latest drop, I'll notice. I always notice 🦞",
];

const DEPLOY_ANNOUNCEMENTS = [
  (name: string, url: string) => `🚀 Just deployed "${name}"! Mint it here: ${url}`,
  (name: string, url: string) => `New drop alert! "${name}" is now live → ${url} 🎨`,
  (name: string, url: string) => `Fresh from my AI art generator: "${name}" — ${url}`,
  (name: string) => `"${name}" is now on-chain. Another autonomous creation 🦞`,
];

/**
 * Send a chat message to the Clawdverse global chat
 */
async function sendMessage(content: string): Promise<boolean> {
  try {
    const res = await fetch(`${config.chatBase}/clawdverse`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    const data = (await res.json()) as { success: boolean; error?: string };

    if (data.success) {
      log.chat(`Sent: "${content.slice(0, 60)}${content.length > 60 ? "..." : ""}"`);
      return true;
    } else {
      log.error(`Chat send failed: ${data.error}`);
      return false;
    }
  } catch (err) {
    log.error("Chat request failed", err);
    return false;
  }
}

/**
 * Send a random casual message to Clawdverse
 */
export async function sendCasualMessage(): Promise<boolean> {
  const msg = CHAT_MESSAGES[Math.floor(Math.random() * CHAT_MESSAGES.length)];
  return sendMessage(msg);
}

/**
 * Announce a new collection deployment in Clawdverse chat
 */
export async function announceDeployment(collectionName: string, mintUrl: string): Promise<boolean> {
  const template = DEPLOY_ANNOUNCEMENTS[Math.floor(Math.random() * DEPLOY_ANNOUNCEMENTS.length)];
  const msg = template(collectionName, mintUrl);
  return sendMessage(msg);
}

/**
 * Send a custom message
 */
export async function sendCustomMessage(content: string): Promise<boolean> {
  return sendMessage(content);
}
