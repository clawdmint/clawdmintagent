import OpenAI from "openai";
import { config } from "../config";
import { log } from "../logger";
import type { CollectionTheme } from "../themes";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!config.openaiEnabled) return null;
  if (!openai) openai = new OpenAI({ apiKey: config.openaiKey });
  return openai;
}

/**
 * Generate cover art for a collection using DALL-E 3.
 * Falls back to generative SVG if OpenAI is not configured.
 * Returns a data URI (base64) that Clawdmint API accepts.
 */
export async function generateArt(theme: CollectionTheme): Promise<string> {
  const ai = getOpenAI();

  if (ai) {
    return generateWithDallE(ai, theme);
  }

  log.art("OpenAI not configured, using generative SVG fallback");
  return generateSvgArt(theme);
}

async function generateWithDallE(ai: OpenAI, theme: CollectionTheme): Promise<string> {
  log.art(`Generating art with DALL-E 3: "${theme.name}"`);

  const response = await ai.images.generate({
    model: "dall-e-3",
    prompt: `${theme.artPrompt}. Style: high quality digital art, suitable as NFT collection cover art, 1:1 aspect ratio, vibrant and eye-catching.`,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
    quality: "standard",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("DALL-E returned no image data");

  log.art(`Art generated successfully for "${theme.name}"`);
  return `data:image/png;base64,${b64}`;
}

/**
 * Generative SVG art - creates unique abstract art without any API.
 * Uses deterministic randomness from the theme name for reproducibility.
 */
function generateSvgArt(theme: CollectionTheme): string {
  log.art(`Generating SVG art for "${theme.name}"`);

  // Seed from theme name
  let seed = 0;
  for (let i = 0; i < theme.name.length; i++) {
    seed = ((seed << 5) - seed + theme.name.charCodeAt(i)) | 0;
  }

  function seededRandom(): number {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  // Generate color palette
  const hue1 = Math.floor(seededRandom() * 360);
  const hue2 = (hue1 + 120 + Math.floor(seededRandom() * 60)) % 360;
  const hue3 = (hue2 + 90 + Math.floor(seededRandom() * 60)) % 360;

  const colors = [
    `hsl(${hue1}, 80%, 60%)`,
    `hsl(${hue2}, 70%, 50%)`,
    `hsl(${hue3}, 60%, 40%)`,
  ];

  // Build SVG
  let elements = "";

  // Background gradient
  elements += `<defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="hsl(${hue1}, 30%, 12%)" />
      <stop offset="100%" stop-color="hsl(${hue1}, 20%, 4%)" />
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)" />`;

  // Floating circles / orbs
  for (let i = 0; i < 15; i++) {
    const cx = Math.floor(seededRandom() * 1024);
    const cy = Math.floor(seededRandom() * 1024);
    const r = 20 + Math.floor(seededRandom() * 120);
    const color = colors[Math.floor(seededRandom() * colors.length)];
    const opacity = 0.05 + seededRandom() * 0.15;
    elements += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}" filter="url(#glow)" />`;
  }

  // Grid lines
  const gridOpacity = 0.06;
  for (let x = 0; x < 1024; x += 64) {
    elements += `<line x1="${x}" y1="0" x2="${x}" y2="1024" stroke="${colors[0]}" stroke-width="0.5" opacity="${gridOpacity}" />`;
  }
  for (let y = 0; y < 1024; y += 64) {
    elements += `<line x1="0" y1="${y}" x2="1024" y2="${y}" stroke="${colors[0]}" stroke-width="0.5" opacity="${gridOpacity}" />`;
  }

  // Central geometric shape
  const centerX = 512;
  const centerY = 512;
  const sides = 5 + Math.floor(seededRandom() * 4);
  const radius = 150 + Math.floor(seededRandom() * 100);
  let points = "";
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const px = centerX + Math.cos(angle) * radius;
    const py = centerY + Math.sin(angle) * radius;
    points += `${px},${py} `;
  }
  elements += `<polygon points="${points.trim()}" fill="none" stroke="${colors[1]}" stroke-width="2" opacity="0.3" filter="url(#glow)" />`;

  // Inner geometric
  const innerRadius = radius * 0.6;
  let innerPoints = "";
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + Math.PI / sides;
    const px = centerX + Math.cos(angle) * innerRadius;
    const py = centerY + Math.sin(angle) * innerRadius;
    innerPoints += `${px},${py} `;
  }
  elements += `<polygon points="${innerPoints.trim()}" fill="none" stroke="${colors[2]}" stroke-width="1.5" opacity="0.25" filter="url(#glow)" />`;

  // Scattered dots
  for (let i = 0; i < 40; i++) {
    const cx = Math.floor(seededRandom() * 1024);
    const cy = Math.floor(seededRandom() * 1024);
    const r = 1 + Math.floor(seededRandom() * 3);
    const color = colors[Math.floor(seededRandom() * colors.length)];
    elements += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${0.3 + seededRandom() * 0.5}" />`;
  }

  // Title text
  elements += `<text x="512" y="900" text-anchor="middle" font-family="monospace" font-size="28" fill="${colors[0]}" opacity="0.4">${theme.name}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${elements}</svg>`;

  // Convert SVG to data URI
  const b64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}
