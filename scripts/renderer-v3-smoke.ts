/**
 * Visual smoke test for the v0.3.0 cPEG renderer.
 *
 * Renders a 5x4 grid of varied (subject, palette, accessory, background) combinations
 * into `.next/renderer-v3-smoke.html` so you can eyeball the output without running the
 * full Next.js dev server. Pixel-art deterministic output is hard to verify with
 * snapshots; a visual check is the fastest way to confirm shading + accessories look
 * right.
 *
 * Run with:  npx ts-node -r tsconfig-paths/register scripts/renderer-v3-smoke.ts
 */
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { renderClawPegSvgV3 } from "@/lib/clawpeg-renderer-v3";

const COLLECTION_SEED = "0f0e0d0c0b0a09080706050403020100fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0";

const samples: Array<{
  pegId: number;
  params: Record<string, string>;
  label: string;
}> = [
  { pegId: 1, params: { subject: "ape", palette: "claw", accessory: "wizard_hat", background: "stars", vibe: "balanced" }, label: "Ape / Wizard / Stars" },
  { pegId: 2, params: { subject: "ape", palette: "shadow", accessory: "fire_mohawk", background: "solid", vibe: "loud" }, label: "Ape / Mohawk / Solid" },
  { pegId: 3, params: { subject: "ape", palette: "volcanic", accessory: "gold_chain", background: "horizon", vibe: "balanced" }, label: "Ape / Chain / Horizon" },
  { pegId: 4, params: { subject: "ape", palette: "gold", accessory: "crown", background: "vignette", vibe: "holy" }, label: "Ape / Crown / Holy" },
  { pegId: 5, params: { subject: "ape", palette: "cyber", accessory: "visor", background: "grid", vibe: "balanced" }, label: "Ape / Visor / Cyber" },
  { pegId: 6, params: { subject: "ape", palette: "jungle", accessory: "samurai_helm", background: "dust", vibe: "balanced" }, label: "Ape / Samurai / Dust" },
  { pegId: 7, params: { subject: "ape", palette: "candy", accessory: "halo", background: "stars", vibe: "holy" }, label: "Ape / Halo / Candy" },
  { pegId: 8, params: { subject: "ape", palette: "frost", accessory: "headphones", background: "vignette", vibe: "balanced" }, label: "Ape / Phones / Frost" },
  { pegId: 9, params: { subject: "ape", palette: "emerald", accessory: "bandanna", background: "horizon", vibe: "balanced" }, label: "Ape / Bandanna / Emerald" },
  { pegId: 10, params: { subject: "ape", palette: "monochrome", accessory: "ninja_mask", background: "solid", vibe: "dark" }, label: "Ape / Ninja / Mono" },
  { pegId: 11, params: { subject: "cat", palette: "shadow", accessory: "gold_chain", background: "stars", vibe: "balanced" }, label: "Cat / Chain / Shadow" },
  { pegId: 12, params: { subject: "robot", palette: "cyber", accessory: "signal_horns", background: "grid", vibe: "loud" }, label: "Robot / Horns / Cyber" },
  { pegId: 13, params: { subject: "dragon", palette: "volcanic", accessory: "crown", background: "horizon", vibe: "balanced" }, label: "Dragon / Crown / Volcanic" },
  { pegId: 14, params: { subject: "alien", palette: "emerald", accessory: "halo", background: "dust", vibe: "holy" }, label: "Alien / Halo / Emerald" },
  { pegId: 15, params: { subject: "frog", palette: "jungle", accessory: "bandanna", background: "vignette", vibe: "balanced" }, label: "Frog / Bandanna / Jungle" },
  { pegId: 16, params: { subject: "ape", palette: "claw", accessory: "wizard_hat", background: "stars", vibe: "balanced" }, label: "Ape / Wizard (det. check)" },
  { pegId: 17, params: { subject: "ape", palette: "claw", accessory: "wizard_hat", background: "stars", vibe: "balanced" }, label: "Ape / Wizard (det. check 2)" },
  { pegId: 18, params: { subject: "ape", palette: "claw", accessory: "wizard_hat", background: "stars", vibe: "balanced" }, label: "Ape / Wizard (det. check 3)" },
  { pegId: 19, params: { subject: "ape", palette: "shadow", accessory: "fire_mohawk", background: "solid", vibe: "loud" }, label: "Ape / Mohawk variant" },
  { pegId: 20, params: { subject: "ape", palette: "volcanic", accessory: "gold_chain", background: "horizon", vibe: "balanced" }, label: "Ape / Chain variant" },
];

const cells = samples
  .map((sample) => {
    const svg = renderClawPegSvgV3({
      rendererId: "clawpeg-agent-pixel",
      rendererVersion: "0.3.0",
      collectionSeed: COLLECTION_SEED,
      tokenMint: "smokeTest1111111111111111111111111111111",
      pegId: sample.pegId,
      params: sample.params,
    });
    return `
<div class="cell">
  <div class="art">${svg}</div>
  <div class="label">#${sample.pegId} ${sample.label}</div>
</div>`;
  })
  .join("\n");

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>cPEG renderer v0.3.0 smoke</title>
<style>
  body { margin: 0; padding: 24px; background: #050505; color: #f7f2df; font-family: ui-monospace, monospace; }
  h1 { font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px; font-size: 22px; }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .cell { background: #0c0c0c; border: 1px solid #1f1f1f; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
  .art { aspect-ratio: 1 / 1; image-rendering: pixelated; }
  .art > svg { width: 100%; height: 100%; image-rendering: pixelated; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; }
</style></head>
<body>
  <h1>cPEG renderer v0.3.0 smoke (24x24 grid)</h1>
  <div class="grid">${cells}</div>
</body></html>`;

if (!existsSync(".next")) mkdirSync(".next");
const outPath = ".next/renderer-v3-smoke.html";
writeFileSync(outPath, html, "utf8");
console.log(`Wrote ${samples.length} samples to ${outPath}`);
