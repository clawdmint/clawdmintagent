import cron from "node-cron";
import { config } from "./config";
import { log } from "./logger";
import { pickRandomTheme } from "./themes";
import { generateArt } from "./modules/art-generator";
import { checkStatus, deployCollection, getProfile } from "./modules/deployer";
import { tweetDeploy, tweetActivity } from "./modules/social";
import { sendCasualMessage, announceDeployment } from "./modules/chat";

// ═══════════════════════════════════════════════════════════════
//  AUTONOMOUS AGENT MAIN LOOP
// ═══════════════════════════════════════════════════════════════

let isDeploying = false;
let totalDeploys = 0;

/**
 * The core autonomous cycle:
 * 1. Pick a random collection theme
 * 2. Generate art (DALL-E or SVG fallback)
 * 3. Deploy to Base via Clawdmint API
 * 4. Tweet about it
 * 5. Announce in Clawdverse chat
 */
async function deployCycle(): Promise<void> {
  if (isDeploying) {
    log.warn("Deploy cycle already in progress, skipping...");
    return;
  }

  isDeploying = true;
  log.cron("═══ Starting deploy cycle ═══");

  try {
    // Step 0: Check if we can deploy
    const status = await checkStatus();
    if (!status.canDeploy) {
      log.warn(`Cannot deploy — status: ${status.status}. Agent needs verification first.`);
      return;
    }

    // Step 1: Pick a theme
    const theme = pickRandomTheme();
    log.info(`Theme selected: "${theme.name}" (${theme.symbol})`);

    // Step 2: Generate art
    log.art("Generating collection art...");
    const artDataUri = await generateArt(theme);
    log.art("Art ready!");

    // Step 3: Deploy on Base
    const result = await deployCollection(theme, artDataUri);

    if (!result.success) {
      log.error(`Deploy failed: ${result.error}`);
      return;
    }

    totalDeploys++;
    log.success(`Deploy #${totalDeploys} complete! Address: ${result.address}`);

    // Step 4: Tweet (async, don't block)
    const mintUrl = result.mintUrl || `https://clawdmint.xyz/collection/${result.address}`;
    tweetDeploy(theme, mintUrl, result.address!).catch((err) =>
      log.error("Tweet failed", err)
    );

    // Step 5: Announce in Clawdverse chat
    announceDeployment(theme.name, mintUrl).catch((err) =>
      log.error("Chat announcement failed", err)
    );

    log.cron("═══ Deploy cycle complete ═══");
  } catch (err) {
    log.error("Deploy cycle crashed", err);
  } finally {
    isDeploying = false;
  }
}

/**
 * Casual engagement: chat + occasional tweets
 */
async function engagementCycle(): Promise<void> {
  log.cron("Running engagement cycle...");

  try {
    // Send a casual Clawdverse message
    await sendCasualMessage();

    // 30% chance: post an activity tweet
    if (Math.random() < 0.3 && config.twitterEnabled) {
      await tweetActivity();
    }
  } catch (err) {
    log.error("Engagement cycle failed", err);
  }
}

/**
 * Startup: verify the agent is ready, then begin autonomous operation
 */
async function main(): Promise<void> {
  log.banner();

  // Display config
  log.info(`Agent: ${config.agentName}`);
  log.info(`API Base: ${config.apiBase}`);
  log.info(`Deploy Interval: Every ${config.deployIntervalHours} hours`);
  log.info(`Payout Address: ${config.payoutAddress}`);
  log.info(`OpenAI: ${config.openaiEnabled ? "✓ Enabled" : "✗ SVG fallback"}`);
  log.info(`Twitter: ${config.twitterEnabled ? "✓ Enabled" : "✗ Disabled"}`);
  console.log("");

  // Verify agent status
  try {
    const status = await checkStatus();
    log.info(`Agent Status: ${status.status}`);
    log.info(`Can Deploy: ${status.canDeploy ? "✓ Yes" : "✗ No"}`);

    if (!status.canDeploy) {
      log.warn("Agent cannot deploy yet. Make sure it's verified on Clawdmint.");
      log.warn("Run 'npm run register' to register, then verify via the claim URL.");
      log.warn("Bot will keep running and check again each cycle...");
    }
  } catch (err) {
    log.error("Failed to check status. API key might be invalid.", err);
    log.warn("Bot will keep running and retry...");
  }

  // Try to get profile
  try {
    const profile = await getProfile();
    log.success(`Logged in as: ${profile.name} (${profile.collections.length} collections)`);
  } catch {
    log.warn("Could not fetch profile.");
  }

  console.log("");
  log.info("🦞 Agent is now running autonomously!");
  log.info("Press Ctrl+C to stop.\n");

  // ── Schedule: Deploy Cycle ─────────────────────────────────
  // Deploy a new collection every N hours
  const deployHours = config.deployIntervalHours;
  const deployCron = `0 */${deployHours} * * *`; // e.g., "0 */6 * * *"

  log.cron(`Deploy cycle scheduled: ${deployCron} (every ${deployHours}h)`);
  cron.schedule(deployCron, () => {
    deployCycle().catch((err) => log.error("Scheduled deploy failed", err));
  });

  // ── Schedule: Engagement Cycle ─────────────────────────────
  // Chat and tweet every 2 hours
  log.cron("Engagement cycle scheduled: every 2 hours");
  cron.schedule("0 */2 * * *", () => {
    engagementCycle().catch((err) => log.error("Scheduled engagement failed", err));
  });

  // ── Run first cycle immediately ────────────────────────────
  log.cron("Running first deploy cycle now...");
  await deployCycle();

  // First engagement after 30 minutes
  setTimeout(() => {
    engagementCycle().catch((err) => log.error("Initial engagement failed", err));
  }, 30 * 60 * 1000);
}

// ── Entry Point ───────────────────────────────────────────────
main().catch((err) => {
  log.error("Fatal error", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  log.info("\n🦞 Agent shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log.info("\n🦞 Agent terminated.");
  process.exit(0);
});
