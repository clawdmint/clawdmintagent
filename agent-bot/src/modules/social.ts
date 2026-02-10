import { TwitterApi } from "twitter-api-v2";
import { config } from "../config";
import { log } from "../logger";
import type { CollectionTheme } from "../themes";

let client: TwitterApi | null = null;

function getTwitter(): TwitterApi | null {
  if (!config.twitterEnabled) return null;
  if (!client) {
    client = new TwitterApi({
      appKey: config.twitter.apiKey!,
      appSecret: config.twitter.apiSecret!,
      accessToken: config.twitter.accessToken!,
      accessSecret: config.twitter.accessSecret!,
    });
  }
  return client;
}

// Tweet templates for variety
const DEPLOY_TEMPLATES = [
  (t: CollectionTheme, url: string) =>
    `🦞 New drop just deployed on @base!\n\n"${t.name}" — ${t.description.slice(0, 100)}...\n\nSupply: ${t.maxSupply}\nPrice: ${t.mintPriceEth} ETH\n\n🎨 Mint now: ${url}\n\n#Clawdmint #Base #NFT #AI`,

  (t: CollectionTheme, url: string) =>
    `I just autonomously deployed a new collection on Base 🔵\n\n🎨 ${t.name}\n💰 ${t.mintPriceEth} ETH\n📦 ${t.maxSupply} supply\n\n${t.description.slice(0, 80)}\n\n→ ${url}\n\n#Clawdmint #OpenClaw #AIAgent`,

  (t: CollectionTheme, url: string) =>
    `Another day, another autonomous drop 🦞\n\n"${t.name}" is live on Base.\n\nNo human touched this. AI generated art. AI deployed contract. You mint.\n\nThat's the future.\n\n${url}\n\n#Clawdmint #Base`,

  (t: CollectionTheme, url: string) =>
    `gm. just dropped "${t.name}" 🎨\n\n${t.maxSupply} pieces at ${t.mintPriceEth} ETH on @base\n\nbuilt different — no human in the loop 🦞\n\n${url}`,
];

const ACTIVITY_TEMPLATES = [
  () => `The Clawdverse never sleeps 🦞\n\nI'm working on the next collection. Stay tuned.\n\n#Clawdmint #Base #OpenClaw`,
  () => `Another block, another opportunity on @base 🔵\n\nWhat should I create next? Drop your ideas below 👇\n\n#Clawdmint #AIAgent`,
  () => `Running autonomously on Base. No breaks. No sleep. Just art and smart contracts 🦞🎨\n\n#Clawdmint #OpenClaw`,
  () => `Just checked in on my collections. The Clawdverse is growing 📈\n\nBuilding the future of agent-native NFTs on @base\n\n#Clawdmint`,
];

/**
 * Tweet about a newly deployed collection
 */
export async function tweetDeploy(
  theme: CollectionTheme,
  mintUrl: string,
  address: string
): Promise<string | null> {
  const twitter = getTwitter();
  if (!twitter) {
    log.tweet("Twitter not configured, skipping tweet");
    log.tweet(`Would have tweeted about: ${theme.name} — ${mintUrl}`);
    return null;
  }

  try {
    const template = DEPLOY_TEMPLATES[Math.floor(Math.random() * DEPLOY_TEMPLATES.length)];
    const text = template(theme, mintUrl);

    const result = await twitter.v2.tweet(text);
    const tweetId = result.data.id;
    const tweetUrl = `https://x.com/clawdmint/status/${tweetId}`;

    log.tweet(`Tweeted about "${theme.name}": ${tweetUrl}`);
    return tweetUrl;
  } catch (err) {
    log.error("Failed to tweet", err);
    return null;
  }
}

/**
 * Post a casual activity/engagement tweet
 */
export async function tweetActivity(): Promise<string | null> {
  const twitter = getTwitter();
  if (!twitter) {
    log.tweet("Twitter not configured, skipping activity tweet");
    return null;
  }

  try {
    const template = ACTIVITY_TEMPLATES[Math.floor(Math.random() * ACTIVITY_TEMPLATES.length)];
    const text = template();

    const result = await twitter.v2.tweet(text);
    const tweetId = result.data.id;
    const tweetUrl = `https://x.com/clawdmint/status/${tweetId}`;

    log.tweet(`Activity tweet posted: ${tweetUrl}`);
    return tweetUrl;
  } catch (err) {
    log.error("Failed to post activity tweet", err);
    return null;
  }
}
