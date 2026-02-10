/**
 * Deploy a single collection manually (for testing).
 * Run: npm run deploy-once
 */
import "dotenv/config";
import { config } from "../config";
import { log } from "../logger";
import { pickRandomTheme } from "../themes";
import { generateArt } from "../modules/art-generator";
import { checkStatus, deployCollection } from "../modules/deployer";
import { tweetDeploy } from "../modules/social";
import { announceDeployment } from "../modules/chat";

async function main() {
  log.banner();

  // Check status
  const status = await checkStatus();
  log.info(`Status: ${status.status}, Can Deploy: ${status.canDeploy}`);

  if (!status.canDeploy) {
    log.error("Agent not verified yet. Cannot deploy.");
    process.exit(1);
  }

  // Pick theme
  const theme = pickRandomTheme();
  log.info(`Theme: "${theme.name}" (${theme.symbol})`);
  log.info(`Supply: ${theme.maxSupply}, Price: ${theme.mintPriceEth} ETH`);

  // Generate art
  log.art("Generating art...");
  const art = await generateArt(theme);
  log.art("Art ready!");

  // Deploy
  const result = await deployCollection(theme, art);

  if (!result.success) {
    log.error(`Deploy failed: ${result.error}`);
    process.exit(1);
  }

  log.success(`Deployed at: ${result.address}`);
  log.success(`TX: ${result.txHash}`);
  log.success(`Mint: ${result.mintUrl}`);

  // Tweet
  const mintUrl = result.mintUrl || `https://clawdmint.xyz/collection/${result.address}`;
  await tweetDeploy(theme, mintUrl, result.address!);

  // Chat
  await announceDeployment(theme.name, mintUrl);

  log.success("Done! 🦞");
}

main().catch((err) => {
  log.error("Fatal", err);
  process.exit(1);
});
