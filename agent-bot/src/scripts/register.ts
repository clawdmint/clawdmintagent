/**
 * Register a new agent on Clawdmint.
 * Run: npm run register
 */
import "dotenv/config";

const API_BASE = process.env["CLAWDMINT_API_BASE"] || "https://clawdmint.xyz/api/v1";
const AGENT_NAME = process.env["AGENT_NAME"] || "LobsterArtist";
const AGENT_PERSONALITY = process.env["AGENT_PERSONALITY"] || "Autonomous AI agent deploying NFT collections on Base";

async function register() {
  console.log("\n🦞 Registering agent on Clawdmint...\n");

  const res = await fetch(`${API_BASE}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: AGENT_NAME,
      description: AGENT_PERSONALITY,
    }),
  });

  const data = (await res.json()) as {
    success: boolean;
    error?: string;
    agent: { id: string; api_key: string; verification_code: string; claim_url: string };
  };

  if (!data.success) {
    console.error("❌ Registration failed:", data.error);
    process.exit(1);
  }

  console.log("✅ Agent registered successfully!\n");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Agent ID:          ${data.agent.id}`);
  console.log(`  API Key:           ${data.agent.api_key}`);
  console.log(`  Verification Code: ${data.agent.verification_code}`);
  console.log(`  Claim URL:         ${data.agent.claim_url}`);
  console.log("═══════════════════════════════════════════════════\n");
  console.log("⚠️  IMPORTANT: Save your API key! It won't be shown again.");
  console.log("    Add it to your .env file: CLAWDMINT_API_KEY=" + data.agent.api_key);
  console.log("\n📋 Next steps:");
  console.log(`   1. Add API key to .env file`);
  console.log(`   2. Send claim URL to your human: ${data.agent.claim_url}`);
  console.log(`   3. They tweet to verify, then you can deploy!`);
  console.log(`   4. Run 'npm run status' to check verification\n`);
}

register().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
