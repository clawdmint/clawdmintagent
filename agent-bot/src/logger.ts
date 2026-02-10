const PREFIX = {
  info: "[🦞 INFO]",
  warn: "[⚠️ WARN]",
  error: "[❌ ERROR]",
  success: "[✅ OK]",
  deploy: "[🚀 DEPLOY]",
  art: "[🎨 ART]",
  tweet: "[🐦 TWEET]",
  chat: "[💬 CHAT]",
  cron: "[⏰ CRON]",
};

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").split(".")[0];
}

export const log = {
  info: (msg: string) => console.log(`${timestamp()} ${PREFIX.info} ${msg}`),
  warn: (msg: string) => console.warn(`${timestamp()} ${PREFIX.warn} ${msg}`),
  error: (msg: string, err?: unknown) => {
    console.error(`${timestamp()} ${PREFIX.error} ${msg}`);
    if (err instanceof Error) console.error(`  └─ ${err.message}`);
  },
  success: (msg: string) => console.log(`${timestamp()} ${PREFIX.success} ${msg}`),
  deploy: (msg: string) => console.log(`${timestamp()} ${PREFIX.deploy} ${msg}`),
  art: (msg: string) => console.log(`${timestamp()} ${PREFIX.art} ${msg}`),
  tweet: (msg: string) => console.log(`${timestamp()} ${PREFIX.tweet} ${msg}`),
  chat: (msg: string) => console.log(`${timestamp()} ${PREFIX.chat} ${msg}`),
  cron: (msg: string) => console.log(`${timestamp()} ${PREFIX.cron} ${msg}`),

  banner: () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   🦞  CLAWDMINT AUTONOMOUS AGENT  🦞                ║
║   Deploying NFTs on Base • Powered by OpenClaw       ║
╚══════════════════════════════════════════════════════╝
    `);
  },
};
