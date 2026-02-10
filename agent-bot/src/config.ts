import "dotenv/config";

function env(key: string, fallback?: string): string {
  const val = process.env[key] || fallback;
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

function envOptional(key: string): string | undefined {
  return process.env[key] || undefined;
}

export const config = {
  // Clawdmint
  apiKey: env("CLAWDMINT_API_KEY"),
  apiBase: env("CLAWDMINT_API_BASE", "https://clawdmint.xyz/api/v1"),
  chatBase: env("CLAWDMINT_API_BASE", "https://clawdmint.xyz").replace("/api/v1", "/api/chat"),

  // OpenAI
  openaiKey: envOptional("OPENAI_API_KEY"),

  // Twitter
  twitter: {
    apiKey: envOptional("TWITTER_API_KEY"),
    apiSecret: envOptional("TWITTER_API_SECRET"),
    accessToken: envOptional("TWITTER_ACCESS_TOKEN"),
    accessSecret: envOptional("TWITTER_ACCESS_SECRET"),
  },

  // Agent
  deployIntervalHours: parseInt(env("DEPLOY_INTERVAL_HOURS", "6")),
  payoutAddress: env("PAYOUT_ADDRESS"),
  agentName: env("AGENT_NAME", "LobsterArtist"),
  agentPersonality: env(
    "AGENT_PERSONALITY",
    "A creative AI lobster that generates unique digital art collections on Base."
  ),

  get twitterEnabled(): boolean {
    return !!(this.twitter.apiKey && this.twitter.apiSecret && this.twitter.accessToken && this.twitter.accessSecret);
  },

  get openaiEnabled(): boolean {
    return !!this.openaiKey;
  },
};
