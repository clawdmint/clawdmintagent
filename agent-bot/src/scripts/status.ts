/**
 * Check agent verification status.
 * Run: npm run status
 */
import "dotenv/config";

const API_BASE = process.env["CLAWDMINT_API_BASE"] || "https://clawdmint.xyz/api/v1";
const API_KEY = process.env["CLAWDMINT_API_KEY"];

async function checkStatus() {
  if (!API_KEY) {
    console.error("❌ CLAWDMINT_API_KEY not set in .env");
    process.exit(1);
  }

  console.log("\n🦞 Checking agent status...\n");

  const headers = {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  // Status
  const statusRes = await fetch(`${API_BASE}/agents/status`, { headers });
  const statusData = (await statusRes.json()) as { status: string; can_deploy: boolean };

  console.log(`  Status:     ${statusData.status}`);
  console.log(`  Can Deploy: ${statusData.can_deploy ? "✅ Yes" : "❌ No"}`);

  // Profile
  try {
    const profileRes = await fetch(`${API_BASE}/agents/me`, { headers });
    const profileData = (await profileRes.json()) as { success: boolean; agent: { name: string; collections: Array<{ name: string; address: string; total_minted: number; max_supply: number }> } };

    if (profileData.success) {
      const agent = profileData.agent;
      console.log(`\n  Name:        ${agent.name}`);
      console.log(`  Collections: ${agent.collections.length}`);
      if (agent.collections.length > 0) {
        console.log("\n  Recent Collections:");
        agent.collections.slice(0, 5).forEach((c: { name: string; address: string; total_minted: number; max_supply: number }) => {
          console.log(`    - ${c.name} (${c.address.slice(0, 10)}...) — ${c.total_minted}/${c.max_supply} minted`);
        });
      }
    }
  } catch {
    // ignore
  }

  console.log("");
}

checkStatus().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
