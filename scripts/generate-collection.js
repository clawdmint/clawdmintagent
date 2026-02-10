#!/usr/bin/env node
/**
 * Clawdmint Agents — 10,000 NFT Collection Generator
 * 
 * Reads renderer code from preview/randomizer.html and generates
 * 10,000 unique SVG images + OpenSea-compatible metadata JSONs.
 * 
 * Usage:
 *   node scripts/generate-collection.js [--count=10000] [--start=1] [--seed=0xCAFE]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ═══════════════════════════════════════════════════════════════════════
// CLI ARGS
// ═══════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v; return acc;
}, {});

const TOTAL_COUNT = parseInt(args.count || '10000', 10);
const START_ID    = parseInt(args.start || '1', 10);
const MASTER_SEED = parseInt(args.seed || '0xCAFE1337', 16);
const OUTPUT_DIR  = path.join(__dirname, '..', 'output');

console.log(`\n🤖 Clawdmint Agents Collection Generator`);
console.log(`   Count: ${TOTAL_COUNT} | Start ID: ${START_ID} | Seed: 0x${MASTER_SEED.toString(16).toUpperCase()}\n`);

// ═══════════════════════════════════════════════════════════════════════
// SVG NODE — String-based SVG builder (replaces browser DOM)
// ═══════════════════════════════════════════════════════════════════════

class SVGNode {
  constructor(tag, attrs) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this._text = '';
    this._innerHTML = '';
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null) continue;
      this.attrs[k === 'cls' ? 'class' : k] = String(v);
    }
  }
  appendChild(child) { if (child) this.children.push(child); return child; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  set innerHTML(h) { this._innerHTML = h; }
  get innerHTML() { return this._innerHTML; }
  set textContent(t) { this._text = String(t); }
  get textContent() { return this._text; }
  classList = { add(cls) { /* noop for node */ } };
  toString() {
    const a = Object.entries(this.attrs)
      .map(([k, v]) => `${k}="${v.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`)
      .join(' ');
    const open = a ? `<${this.tag} ${a}>` : `<${this.tag}>`;
    const body = this._innerHTML || this._text || this.children.map(c => c.toString()).join('');
    return `${open}${body}</${this.tag}>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SEEDED PRNG — mulberry32 (deterministic per tokenId)
// ═══════════════════════════════════════════════════════════════════════

function createPRNG(seed) {
  let s = seed >>> 0;
  return function() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// EXTRACT RENDERER CODE FROM randomizer.html
// ═══════════════════════════════════════════════════════════════════════

const htmlPath = path.join(__dirname, '..', 'preview', 'randomizer.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract <script> block
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) { console.error('ERROR: No <script> in randomizer.html'); process.exit(1); }

let coreCode = scriptMatch[1];

// Remove original DOM-based el() and g() functions
// Uses paren-then-brace counting to handle default params like attrs={}
function removeFn(code, name) {
  const re = new RegExp(`function ${name}\\s*\\(`);
  const m = re.exec(code);
  if (!m) return code;
  // Step 1: Skip past the parameter list (find matching close-paren)
  let parenDepth = 0, bodySearchStart = m.index;
  for (let i = m.index; i < code.length; i++) {
    if (code[i] === '(') parenDepth++;
    if (code[i] === ')') { parenDepth--; if (parenDepth === 0) { bodySearchStart = i + 1; break; } }
  }
  // Step 2: Find the opening { of the function body
  let braceStart = code.indexOf('{', bodySearchStart);
  if (braceStart === -1) return code;
  // Step 3: Count braces to find the matching close }
  let depth = 0, end = braceStart;
  for (let i = braceStart; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return code.slice(0, m.index) + code.slice(end);
}

coreCode = removeFn(coreCode, 'el');
coreCode = removeFn(coreCode, 'g');

// Remove the generate() function and everything after it (UI code)
const genIdx = coreCode.indexOf('function generate(');
if (genIdx > 0) coreCode = coreCode.substring(0, genIdx);

// Remove NS constant (not needed)
coreCode = coreCode.replace(/const NS\s*=\s*["'][^"']*["'];?/g, '');

// Extract CSS from the HTML <style> block for embedding in SVGs
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const svgCSS = cssMatch ? cssMatch[1]
  .split('\n')
  .filter(l => l.includes('@keyframes') || l.includes('animation') || l.includes('.pulse') || l.includes('.flicker') || l.includes('.scan') || l.includes('.drift') || l.includes('.spin'))
  .join('\n')
  : '';

// Build animation CSS for SVG embedding
const SVG_STYLE = `
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.pulse{animation:pulse 2s ease-in-out infinite}
@keyframes flicker{0%,100%{opacity:.8}25%{opacity:1}50%{opacity:.6}75%{opacity:.9}}
.flicker{animation:flicker 1.5s ease-in-out infinite}
@keyframes scan{0%{transform:translateY(-8px);opacity:0}50%{opacity:.6}100%{transform:translateY(8px);opacity:0}}
.scan{animation:scan 3s linear infinite}
@keyframes drift{0%{transform:translateY(0)}50%{transform:translateY(-3px)}100%{transform:translateY(0)}}
.drift{animation:drift 4s ease-in-out infinite}
@keyframes rotate{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.spin{animation:rotate 8s linear infinite;transform-origin:center}
`.trim();

// ═══════════════════════════════════════════════════════════════════════
// CREATE SANDBOX AND EVALUATE
// ═══════════════════════════════════════════════════════════════════════

// Our SVGNode-based el/g preamble
const preamble = `
function el(tag, attrs) { return new SVGNode(tag, attrs || {}); }
function g() {
  var grp = el("g");
  for (var i = 0; i < arguments.length; i++) grp.appendChild(arguments[i]);
  return grp;
}
`;

// Create sandbox with Math.random that we can override
const sandboxMath = Object.create(null);
Object.getOwnPropertyNames(Math).forEach(k => {
  sandboxMath[k] = typeof Math[k] === 'function' ? Math[k].bind(Math) : Math[k];
});
// Default random (will be overridden per token)
sandboxMath.random = Math.random;

const sandbox = vm.createContext({
  SVGNode,
  Math: sandboxMath,
  console,
  parseInt,
  parseFloat,
  String,
  Object,
  Array,
  Number,
  isNaN,
  isFinite,
  undefined,
  NaN,
  Infinity,
});

// Convert const/let to var so declarations become sandbox properties
// (const/let in vm context are script-scoped, not added to sandbox object)
coreCode = coreCode.replace(/\bconst\b/g, 'var');
coreCode = coreCode.replace(/\blet\b/g, 'var');

// Run the code in sandbox
try {
  vm.runInContext(preamble + coreCode, sandbox);
} catch (e) {
  console.error('ERROR evaluating randomizer code:', e.message);
  // Show context around error
  if (e.stack) {
    const lineMatch = e.stack.match(/:(\d+):\d+/);
    if (lineMatch) console.error('  Near line:', lineMatch[1]);
  }
  process.exit(1);
}

console.log('✅ Randomizer code loaded successfully');

// Verify required objects exist
const required = ['HEAD_RENDERERS','EYES_RENDERERS','MOUTH_RENDERERS','BODY_RENDERERS','ARMS_RENDERERS','LEGS_RENDERERS','BG_RENDERERS','PRIMARIES','SECONDARIES','ACCENTS','ADJECTIVES','ROLES','MYTHIC_NAMES','DESIGNATIONS','CLEARANCE_POOL','COMBAT_POOL','RW','RN','RO','RORD','pickW','pickTiered','pickPool','pick','pickWAccent','highestRarity','setup3dDefs'];
for (const name of required) {
  if (!sandbox[name]) {
    console.error(`ERROR: ${name} not found in sandbox`);
    process.exit(1);
  }
}

// Count available traits
const traitCounts = {
  heads: Object.keys(sandbox.HEAD_RENDERERS).length,
  eyes: Object.keys(sandbox.EYES_RENDERERS).length,
  mouths: Object.keys(sandbox.MOUTH_RENDERERS).length,
  bodies: Object.keys(sandbox.BODY_RENDERERS).length,
  arms: Object.keys(sandbox.ARMS_RENDERERS).length,
  legs: Object.keys(sandbox.LEGS_RENDERERS).length,
  backgrounds: Object.keys(sandbox.BG_RENDERERS).length,
};
console.log('📊 Trait counts:', JSON.stringify(traitCounts));

// ═══════════════════════════════════════════════════════════════════════
// GENERATE AGENT FUNCTION (runs inside sandbox)
// ═══════════════════════════════════════════════════════════════════════

const generateAgentCode = `
function generateAgent(tokenId) {
  // Pick colors
  var primary = pick(PRIMARIES);
  var secondary = pick(SECONDARIES.filter(function(s) { return s.hex !== primary.hex; }));
  var accent = pickWAccent();
  var c = { p: primary.hex, s: secondary.hex, a: accent.hex };

  // Pick visual parts
  var head = pickW(HEAD_RENDERERS);
  var eyes = pickW(EYES_RENDERERS);
  var mouth = pickW(MOUTH_RENDERERS);
  var body = pickW(BODY_RENDERERS);
  var arms = pickW(ARMS_RENDERERS);
  var legs = pickW(LEGS_RENDERERS);
  var bg = pickW(BG_RENDERERS);

  // Generate name
  var isMythic = Math.random() < 0.005;
  var agentName, nameRarity, adjRarity = "c", roleRarity = "c";
  if (isMythic) {
    agentName = pick(MYTHIC_NAMES);
    nameRarity = "m";
  } else {
    var adj = pickTiered(ADJECTIVES);
    var role = pickTiered(ROLES);
    agentName = adj.value + "-" + role.value;
    adjRarity = adj.r;
    roleRarity = role.r;
    nameRarity = RORD[adj.r] >= RORD[role.r] ? adj.r : role.r;
  }

  // Pick metadata
  var designation = pickTiered(DESIGNATIONS);
  var clearance = pickPool(CLEARANCE_POOL);
  var combat = pickPool(COMBAT_POOL);
  var efficiency = (45 + Math.random() * 54.9).toFixed(1);

  // Classification code
  var codePrefix = agentName.slice(0,2).toUpperCase();
  var codeNum = String(Math.floor(Math.random() * 900000 + 100000));
  var codeSuffix = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
  var classCode = codePrefix + "-" + codeNum + "-" + codeSuffix;

  // Overall rarity
  var allRarities = [accent.r, head.r, eyes.r, mouth.r, body.r, arms.r, legs.r, bg.r, nameRarity, designation.r, clearance.r, combat.r];
  var overallRarity = highestRarity(allRarities);

  // Build SVG
  var svg = el("svg", {viewBox:"-30 -10 260 260", xmlns:"http://www.w3.org/2000/svg"});

  // Embedded CSS
  var styleEl = el("style");
  styleEl.textContent = SVG_STYLE;
  svg.appendChild(styleEl);

  // 3D lighting defs
  setup3dDefs(svg, c);

  // Bleed fill
  svg.appendChild(el("rect", {x:-30, y:-10, width:260, height:260, fill:"#050810"}));

  // Background
  bg.d(svg, c);

  // Floor shadow
  svg.appendChild(el("ellipse", {cx:100, cy:232, rx:55, ry:8, fill:"#000", opacity:.25}));

  // Draw character parts
  svg.appendChild(legs.d(c));
  svg.appendChild(arms.d(c));
  svg.appendChild(body.d(c));
  svg.appendChild(head.d(c));
  svg.appendChild(eyes.d(c));
  svg.appendChild(mouth.d(c));

  // Post-processing overlays
  var postFx = el("g");
  postFx.appendChild(el("ellipse", {cx:100, cy:56, rx:34, ry:20, fill:c.a, opacity:.025}));
  postFx.appendChild(el("ellipse", {cx:100, cy:125, rx:28, ry:35, fill:c.a, opacity:.012}));
  postFx.appendChild(el("rect", {x:55, y:22, width:90, height:200, fill:"url(#circuits)", opacity:.7}));
  for(var i=0;i<16;i++){
    var px=8+Math.random()*184, py=2+Math.random()*244;
    var pr=Math.random()>.82?1:.35;
    postFx.appendChild(el("circle", {cx:px, cy:py, r:pr, fill:c.a,
      opacity:(.006+Math.random()*.03).toFixed(3),
      "class": Math.random()>.5?"drift":"pulse"}));
  }
  postFx.appendChild(el("ellipse", {cx:100, cy:242, rx:42, ry:4, fill:c.a, opacity:.018}));
  var scanFx = el("g", {opacity:.015});
  for(var y=-10;y<250;y+=2.5) scanFx.appendChild(el("line", {x1:-30,y1:y,x2:230,y2:y,stroke:"#fff","stroke-width":.3}));
  postFx.appendChild(scanFx);
  svg.appendChild(postFx);

  var svgStr = '<?xml version="1.0" encoding="UTF-8"?>\\n' + svg.toString();

  return {
    svg: svgStr,
    traits: {
      head: { name: head.name, rarity: head.r },
      eyes: { name: eyes.name, rarity: eyes.r },
      mouth: { name: mouth.name, rarity: mouth.r },
      body: { name: body.name, rarity: body.r },
      arms: { name: arms.name, rarity: arms.r },
      legs: { name: legs.name, rarity: legs.r },
      background: { name: bg.name, rarity: bg.r },
      accent: { name: accent.name, rarity: accent.r },
      primary: { hex: primary.hex },
      secondary: { hex: secondary.hex },
    },
    meta: {
      agentName: agentName,
      nameRarity: nameRarity,
      classCode: classCode,
      designation: { value: designation.value, rarity: designation.r },
      clearance: { level: clearance.level, rarity: clearance.r },
      combat: { name: combat.name, rarity: combat.r },
      efficiency: parseFloat(efficiency),
      overallRarity: overallRarity,
      isMythic: isMythic || nameRarity === "m",
    }
  };
}
`;

// Inject SVG_STYLE into sandbox
sandbox.SVG_STYLE = SVG_STYLE;

// Run generateAgent definition in sandbox
vm.runInContext(generateAgentCode, sandbox);

console.log('✅ Generation function ready\n');

// ═══════════════════════════════════════════════════════════════════════
// PLACEHOLDER SVG (pre-reveal "CLASSIFIED" image)
// ═══════════════════════════════════════════════════════════════════════

const PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="-30 -10 260 260" xmlns="http://www.w3.org/2000/svg">
<style>
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes scan{0%{transform:translateY(-60px)}100%{transform:translateY(260px)}}
</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#0a0e1a"/>
<stop offset="100%" stop-color="#050810"/>
</linearGradient>
</defs>
<rect x="-30" y="-10" width="260" height="260" fill="url(#bg)"/>
<rect x="40" y="50" width="120" height="150" rx="8" fill="none" stroke="#1e293b" stroke-width="2" stroke-dasharray="6 4"/>
<text x="100" y="115" text-anchor="middle" fill="#334155" font-family="monospace" font-size="14" font-weight="bold">CLASSIFIED</text>
<text x="100" y="135" text-anchor="middle" fill="#1e293b" font-family="monospace" font-size="9">AGENT DATA LOCKED</text>
<rect x="75" y="155" width="50" height="6" rx="3" fill="#06b6d4" opacity=".15" style="animation:pulse 2s ease-in-out infinite"/>
<text x="100" y="185" text-anchor="middle" fill="#1e293b" font-family="monospace" font-size="7">REVEAL ON SOLD OUT</text>
<rect x="-30" y="120" width="260" height="3" fill="#06b6d4" opacity=".03" style="animation:scan 4s linear infinite"/>
<text x="100" y="230" text-anchor="middle" fill="#0f172a" font-family="monospace" font-size="8">CLAWDMINT AGENTS</text>
</svg>`;

// ═══════════════════════════════════════════════════════════════════════
// METADATA BUILDER
// ═══════════════════════════════════════════════════════════════════════

const RN_MAP = {c:"Common",u:"Uncommon",r:"Rare",e:"Epic",l:"Legendary",m:"Mythic"};

function buildMetadata(tokenId, agentData, imageCID) {
  const { traits, meta } = agentData;
  const imageURI = imageCID 
    ? `ipfs://${imageCID}/images/${tokenId}.svg`
    : `images/${tokenId}.svg`;

  return {
    name: `Clawdmint Agent #${tokenId}`,
    description: `${meta.agentName} [${meta.classCode}] — ${meta.designation.value}. Clearance Level ${meta.clearance.level}. Clawdmint Agents are a collection of 10,000 unique AI-powered agent NFTs on Base.`,
    image: imageURI,
    external_url: `https://clawdmint.com/agents/${tokenId}`,
    attributes: [
      { trait_type: "Head", value: traits.head.name },
      { trait_type: "Head Rarity", value: RN_MAP[traits.head.rarity] },
      { trait_type: "Eyes", value: traits.eyes.name },
      { trait_type: "Eyes Rarity", value: RN_MAP[traits.eyes.rarity] },
      { trait_type: "Mouth", value: traits.mouth.name },
      { trait_type: "Body", value: traits.body.name },
      { trait_type: "Body Rarity", value: RN_MAP[traits.body.rarity] },
      { trait_type: "Arms", value: traits.arms.name },
      { trait_type: "Arms Rarity", value: RN_MAP[traits.arms.rarity] },
      { trait_type: "Legs", value: traits.legs.name },
      { trait_type: "Legs Rarity", value: RN_MAP[traits.legs.rarity] },
      { trait_type: "Background", value: traits.background.name },
      { trait_type: "Background Rarity", value: RN_MAP[traits.background.rarity] },
      { trait_type: "Accent Color", value: traits.accent.name },
      { trait_type: "Accent Rarity", value: RN_MAP[traits.accent.rarity] },
      { trait_type: "Agent Name", value: meta.agentName },
      { trait_type: "Name Rarity", value: RN_MAP[meta.nameRarity] },
      { trait_type: "Classification Code", value: meta.classCode },
      { trait_type: "Strategic Designation", value: meta.designation.value },
      { trait_type: "Clearance Level", display_type: "number", value: meta.clearance.level },
      { trait_type: "Combat Mod", value: meta.combat.name },
      { trait_type: "Efficiency", display_type: "number", value: meta.efficiency },
      { trait_type: "Overall Rarity", value: RN_MAP[meta.overallRarity] },
      ...(meta.isMythic ? [{ trait_type: "Mythic", value: "Yes" }] : []),
    ],
  };
}

function buildPlaceholderMetadata(tokenId) {
  return {
    name: `Clawdmint Agent #${tokenId}`,
    description: "This agent's identity is CLASSIFIED. Reveal happens when the collection is sold out.",
    image: "ipfs://PLACEHOLDER_CID/placeholder.svg",
    attributes: [
      { trait_type: "Status", value: "Classified" },
    ],
  };
}

function buildCollectionMetadata(imageCID) {
  return {
    name: "Clawdmint Agents",
    description: "10,000 unique AI-powered agent NFTs on Base. Each agent has distinct traits, abilities, and a classified identity. Built by Clawdmint — the onchain agent factory.",
    image: imageCID ? `ipfs://${imageCID}/placeholder.svg` : "placeholder.svg",
    external_link: "https://clawdmint.com",
    seller_fee_basis_points: 500,
    fee_recipient: "0x0000000000000000000000000000000000000000", // Will be set during deployment
  };
}

// ═══════════════════════════════════════════════════════════════════════
// UNIQUENESS TRACKER
// ═══════════════════════════════════════════════════════════════════════

const seen = new Set();
function traitHash(agentData) {
  const t = agentData.traits;
  return `${t.head.name}|${t.eyes.name}|${t.mouth.name}|${t.body.name}|${t.arms.name}|${t.legs.name}|${t.background.name}|${t.accent.name}|${agentData.meta.agentName}`;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN GENERATION LOOP
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  // Create output directories
  const imagesDir = path.join(OUTPUT_DIR, 'images');
  const metadataDir = path.join(OUTPUT_DIR, 'metadata');
  
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(metadataDir, { recursive: true });

  // Save placeholder
  fs.writeFileSync(path.join(OUTPUT_DIR, 'placeholder.svg'), PLACEHOLDER_SVG);
  console.log('📋 Placeholder SVG saved');

  // Statistics
  const stats = { total: 0, mythic: 0, legendary: 0, epic: 0, rare: 0, uncommon: 0, common: 0, duplicates: 0 };
  const startTime = Date.now();

  console.log(`\n🚀 Generating ${TOTAL_COUNT} agents...\n`);

  for (let id = START_ID; id < START_ID + TOTAL_COUNT; id++) {
    // Set seeded PRNG for this token
    const prng = createPRNG(MASTER_SEED ^ (id * 0x45d9f3b));
    sandbox.Math.random = prng;

    // Generate agent
    let agent;
    let attempts = 0;
    do {
      agent = sandbox.generateAgent(id);
      const hash = traitHash(agent);
      if (!seen.has(hash)) {
        seen.add(hash);
        break;
      }
      // Duplicate — try with different seed offset
      stats.duplicates++;
      attempts++;
      const altPrng = createPRNG(MASTER_SEED ^ (id * 0x45d9f3b) ^ (attempts * 0x9E3779B9));
      sandbox.Math.random = altPrng;
    } while (attempts < 100);

    // Save SVG
    fs.writeFileSync(path.join(imagesDir, `${id}.svg`), agent.svg);

    // Save metadata JSON
    const metadata = buildMetadata(id, agent, null); // CID will be updated after IPFS upload
    fs.writeFileSync(path.join(metadataDir, `${id}.json`), JSON.stringify(metadata, null, 2));

    // Track rarity stats
    stats.total++;
    const r = agent.meta.overallRarity;
    if (r === 'm') stats.mythic++;
    else if (r === 'l') stats.legendary++;
    else if (r === 'e') stats.epic++;
    else if (r === 'r') stats.rare++;
    else if (r === 'u') stats.uncommon++;
    else stats.common++;

    // Progress
    if (id % 500 === 0 || id === START_ID + TOTAL_COUNT - 1) {
      const pct = ((id - START_ID + 1) / TOTAL_COUNT * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = ((id - START_ID + 1) / (Date.now() - startTime) * 1000).toFixed(0);
      process.stdout.write(`\r  [${pct}%] ${id - START_ID + 1}/${TOTAL_COUNT} agents | ${elapsed}s | ${rate}/s`);
    }
  }

  // Save collection metadata
  fs.writeFileSync(
    path.join(metadataDir, 'collection.json'),
    JSON.stringify(buildCollectionMetadata(null), null, 2)
  );

  // Save placeholder metadata for each token (pre-reveal)
  const placeholderDir = path.join(OUTPUT_DIR, 'placeholder-metadata');
  fs.mkdirSync(placeholderDir, { recursive: true });
  for (let id = START_ID; id < START_ID + TOTAL_COUNT; id++) {
    fs.writeFileSync(
      path.join(placeholderDir, `${id}.json`),
      JSON.stringify(buildPlaceholderMetadata(id), null, 2)
    );
  }
  fs.writeFileSync(
    path.join(placeholderDir, 'collection.json'),
    JSON.stringify(buildCollectionMetadata(null), null, 2)
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n\n✅ Generation complete!`);
  console.log(`   Total: ${stats.total} agents in ${elapsed}s`);
  console.log(`   Duplicates resolved: ${stats.duplicates}`);
  console.log(`\n📊 Rarity Distribution:`);
  console.log(`   Common:    ${stats.common} (${(stats.common/stats.total*100).toFixed(1)}%)`);
  console.log(`   Uncommon:  ${stats.uncommon} (${(stats.uncommon/stats.total*100).toFixed(1)}%)`);
  console.log(`   Rare:      ${stats.rare} (${(stats.rare/stats.total*100).toFixed(1)}%)`);
  console.log(`   Epic:      ${stats.epic} (${(stats.epic/stats.total*100).toFixed(1)}%)`);
  console.log(`   Legendary: ${stats.legendary} (${(stats.legendary/stats.total*100).toFixed(1)}%)`);
  console.log(`   Mythic:    ${stats.mythic} (${(stats.mythic/stats.total*100).toFixed(1)}%)`);
  console.log(`\n📁 Output: ${OUTPUT_DIR}`);
  console.log(`   images/     → ${TOTAL_COUNT} SVG files`);
  console.log(`   metadata/   → ${TOTAL_COUNT} JSON files + collection.json`);
  console.log(`   placeholder-metadata/ → ${TOTAL_COUNT} placeholder JSONs`);
  console.log(`   placeholder.svg → Pre-reveal image\n`);
}

main().catch(e => { console.error('\n❌ Fatal error:', e); process.exit(1); });
