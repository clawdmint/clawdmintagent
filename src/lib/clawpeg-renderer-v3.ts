/**
 * cPEG Renderer v0.3.0  -  high-fidelity deterministic pixel-art engine.
 *
 * Goals:
 *   - Match the reference quality of premium pixel-art PFP collections (multi-tone
 *     shading, dense feature detail, accessorised head + body composition).
 *   - Stay 100% deterministic. Same (seed, params) always produces identical SVG.
 *   - Produce clean, frame-friendly 24×24 logical pixels exported at 48×48 SVG units
 *     with explicit width/height so browser <img> never applies a default 300×150 box
 *     (which made previews look like random cropped blocks). `shape-rendering: crispEdges`
 *     keeps edges sharp when scaled.
 *
 * Design:
 *   - Each subject (`ape`, `cat`, `robot`, ...) has its own creature template that
 *     emits typed pixel groups: silhouette, mid-tone, highlight, shadow, eye, etc.
 *   - A common palette layer assigns concrete colors to the typed groups so the
 *     same template re-skins across all 8 palettes (`claw`, `cyber`, `volcanic`...).
 *   - Accessories (`wizard_hat`, `fire_mohawk`, `gold_chain`, `crown`, `halo`,
 *     `visor`, `bandanna`, `samurai_helm`, `headphones`, `signal_horns`) draw on
 *     top of the creature with their own multi-tone palettes.
 *   - Backgrounds (`solid`, `stars`, `grid`, `vignette`, `dust`, `horizon`) frame
 *     the composition without competing with the subject.
 *
 * Public surface:
 *   - `renderClawPegSvgV3(input)`  -  render an identity peg.
 *   - `renderClawPegTradeArtSvgV3(input)`  -  render a trade-art swap glyph.
 *   - `getClawPegTraitsV3(input)`  -  return rarity + trait dictionary for indexers.
 */

import type {
  ClawPegRenderInput,
  ClawPegTradeArtRenderInput,
} from "./clawpeg-renderer";

type SubjectKey =
  | "ape"
  | "agent"
  | "monkey"
  | "cat"
  | "dog"
  | "robot"
  | "alien"
  | "dragon"
  | "wizard"
  | "samurai"
  | "ninja"
  | "ghost"
  | "frog"
  | "bear"
  | "bird"
  | "horse"
  | "sports"
  | "meme"
  | "unicorn"
  | "punk"
  | "azuki"
  | "fox"
  | "wolf"
  | "zombie"
  | "demon"
  | "vampire"
  | "skeleton"
  | "lion"
  | "penguin"
  | "panda"
  | "custom";

const SUBJECT_LABELS: Record<SubjectKey, string> = {
  ape: "Ape",
  agent: "Agent",
  monkey: "Monkey",
  cat: "Cat",
  dog: "Dog",
  robot: "Robot",
  alien: "Alien",
  dragon: "Dragon",
  wizard: "Wizard",
  samurai: "Samurai",
  ninja: "Ninja",
  ghost: "Ghost",
  frog: "Frog",
  bear: "Bear",
  bird: "Bird",
  horse: "Horse",
  sports: "Athlete",
  meme: "Meme",
  unicorn: "Unicorn",
  punk: "Punk",
  azuki: "Azuki",
  fox: "Fox",
  wolf: "Wolf",
  zombie: "Zombie",
  demon: "Demon",
  vampire: "Vampire",
  skeleton: "Skeleton",
  lion: "Lion",
  penguin: "Penguin",
  panda: "Panda",
  custom: "Custom",
};

type Rect = [number, number, number, number, string, number?];

interface CreaturePalette {
  bg: string;
  bgAlt: string;
  fur0: string;
  fur1: string;
  fur2: string;
  fur3: string;
  shadow: string;
  brow: string;
  eyeIris: string;
  eyeGlow: string;
  pupil: string;
  nose: string;
  mouth: string;
  lip: string;
  body0: string;
  body1: string;
  bodyShade: string;
  accent: string;
  metal: string;
  metalDark: string;
  spark: string;
}

interface RenderModel {
  seed: string;
  rng: () => number;
  subject: SubjectKey;
  paletteName: string;
  palette: CreaturePalette;
  background: BackgroundKey;
  accessory: AccessoryKey;
  pose: string;
  vibe: string;
  rank: number;
  rarity: "Common" | "Uncommon" | "Rare" | "Mythic";
}

type AccessoryKey =
  | "none"
  | "wizard_hat"
  | "fire_mohawk"
  | "gold_chain"
  | "crown"
  | "halo"
  | "visor"
  | "bandanna"
  | "samurai_helm"
  | "headphones"
  | "signal_horns"
  | "ninja_mask"
  | "cigar";

type BackgroundKey = "solid" | "stars" | "grid" | "vignette" | "dust" | "horizon";

const ACCESSORY_LABELS: Record<AccessoryKey, string> = {
  none: "Bare",
  wizard_hat: "Wizard Hat",
  fire_mohawk: "Fire Mohawk",
  gold_chain: "Gold Chain",
  crown: "Crown",
  halo: "Halo",
  visor: "Visor",
  bandanna: "Bandanna",
  samurai_helm: "Samurai Helm",
  headphones: "Headphones",
  signal_horns: "Signal Horns",
  ninja_mask: "Ninja Mask",
  cigar: "Cigar",
};

interface PaletteSpec {
  bg: string;
  bgAlt: string;
  furBase: string;
  accent: string;
  spark: string;
  metal: string;
}

const PALETTE_SPECS: Record<string, PaletteSpec> = {
  claw: { bg: "#0c0710", bgAlt: "#1a1024", furBase: "#1c1c1f", accent: "#fa5246", spark: "#f4c95d", metal: "#e0c465" },
  jungle: { bg: "#0d2417", bgAlt: "#143922", furBase: "#3a2a1e", accent: "#43d17a", spark: "#f2b84b", metal: "#c8a157" },
  candy: { bg: "#1d0e22", bgAlt: "#321538", furBase: "#1f1228", accent: "#ff5db1", spark: "#fff0a1", metal: "#ff9bd2" },
  cyber: { bg: "#06121f", bgAlt: "#0f1f33", furBase: "#1a232c", accent: "#28f2ff", spark: "#ff3df2", metal: "#a3f5ff" },
  volcanic: { bg: "#1a0808", bgAlt: "#33110b", furBase: "#1a0e0a", accent: "#ff4d2d", spark: "#ffb000", metal: "#f6c046" },
  frost: { bg: "#0d1d2c", bgAlt: "#152d44", furBase: "#1a2330", accent: "#80dfff", spark: "#ffffff", metal: "#cfe7ff" },
  gold: { bg: "#1a1206", bgAlt: "#2c1d09", furBase: "#1a120a", accent: "#dba542", spark: "#fff06a", metal: "#f7d56a" },
  monochrome: { bg: "#0a0a0a", bgAlt: "#161616", furBase: "#1d1d1d", accent: "#9c9c9c", spark: "#f4f4f4", metal: "#cfcfcf" },
  shadow: { bg: "#080807", bgAlt: "#13110d", furBase: "#0f0e0e", accent: "#ff3a2e", spark: "#f6c046", metal: "#cfa341" },
  emerald: { bg: "#06241b", bgAlt: "#0d3a2c", furBase: "#16221d", accent: "#3aff9d", spark: "#fff58f", metal: "#a8e8c2" },
};

function hashUint32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0];
}

function shadeHex(hex: string, ratio: number): string {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + Math.round(ratio * 255)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round(ratio * 255)));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round(ratio * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Linear RGB mix for palette-tinted subjects (e.g. pegasus body that must not read as flat white). */
function mixRgbHex(hexA: string, hexB: string, t: number): string {
  const parse = (hex: string) => {
    const v = parseInt(hex.replace("#", ""), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  };
  const a = parse(hexA);
  const b = parse(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

function buildCreaturePalette(spec: PaletteSpec, subject: SubjectKey, vibe: string): CreaturePalette {
  let furBase = spec.furBase;
  if (subject === "alien") furBase = "#2a5d2a";
  if (subject === "frog") furBase = "#1d4a2b";
  if (subject === "robot") furBase = "#2a3138";
  if (subject === "ghost") furBase = "#dde7f2";
  if (subject === "dragon") furBase = "#202d4a";
  if (subject === "cat") furBase = "#1a1a1a";
  if (subject === "bird") furBase = "#3a2310";
  if (subject === "unicorn") {
    const accentTint = shadeHex(spec.accent, -0.16);
    furBase = mixRgbHex(spec.furBase, accentTint, 0.62);
  }
  if (subject === "punk") furBase = "#242424";
  if (subject === "azuki") furBase = "#2c2220";
  if (subject === "zombie") furBase = "#4a5c46";
  if (subject === "demon") furBase = "#3a1c24";
  if (subject === "vampire") furBase = "#b8a8b0";
  if (subject === "skeleton") furBase = "#c8c4b8";
  if (subject === "panda") furBase = "#ececec";
  if (subject === "penguin") furBase = "#1a1a1e";
  if (vibe === "loud") furBase = shadeHex(furBase, 0.05);

  // Wider tonal spread reads better at 24×24; dark vibe deepens the base slightly for contrast on bg.
  const fur0 = vibe === "dark" ? shadeHex(furBase, -0.07) : furBase;
  const fur1 = shadeHex(fur0, 0.17);
  const fur2 = shadeHex(fur0, 0.34);
  const fur3 = shadeHex(fur0, 0.5);
  const shadow = shadeHex(fur0, vibe === "dark" ? -0.24 : -0.2);
  const brow = "#040404";
  const body0 = shadeHex(fur0, -0.07);
  const body1 = shadeHex(fur0, 0.05);
  const bodyShade = shadeHex(fur0, vibe === "dark" ? -0.29 : -0.26);

  const accent = spec.accent;
  const eyeGlow = vibe === "holy" ? spec.spark : accent;
  const eyeIris = shadeHex(accent, vibe === "dark" ? -0.14 : -0.22);
  const pupil = "#0a0a0a";

  return {
    bg: spec.bg,
    bgAlt: spec.bgAlt,
    fur0,
    fur1,
    fur2,
    fur3,
    shadow,
    brow,
    eyeIris,
    eyeGlow,
    pupil,
    nose: subject === "ghost" ? "#1a2233" : "#040404",
    mouth: "#040404",
    lip: shadeHex(fur0, 0.28),
    body0,
    body1,
    bodyShade,
    accent,
    metal: spec.metal,
    metalDark: shadeHex(spec.metal, -0.22),
    spark: spec.spark,
  };
}

function rectsFromMask(mask: string[], color: string, opacity?: number): Rect[] {
  const out: Rect[] = [];
  for (let y = 0; y < mask.length; y += 1) {
    const row = mask[y] ?? "";
    let runStart = -1;
    for (let x = 0; x <= row.length; x += 1) {
      const ch = row[x];
      if (ch === "#") {
        if (runStart === -1) runStart = x;
      } else if (runStart !== -1) {
        const width = x - runStart;
        if (opacity !== undefined) {
          out.push([runStart, y, width, 1, color, opacity]);
        } else {
          out.push([runStart, y, width, 1, color]);
        }
        runStart = -1;
      }
    }
  }
  return out;
}

const APE_SILHOUETTE = [
  "                        ",
  "                        ",
  "      ##########        ",
  "    ##############      ",
  "   ################     ",
  "  ##################    ",
  "  ##################    ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  "######################  ",
  "######################  ",
  "######################  ",
  "######################  ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  "  ##################    ",
  "  ##################    ",
  "                        ",
  "                        ",
];

const APE_HIGHLIGHT_TOP = [
  "                        ",
  "                        ",
  "                        ",
  "        ######          ",
  "      ##########        ",
  "       ########         ",
];

const APE_BROW = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  " ####          #####    ",
  " #####         #####    ",
];

const APE_EYE_SOCKET = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "  ####          ####    ",
  "  ####          ####    ",
  "  ####          ####    ",
];

const APE_EYE_GLOW = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "   ###            ###   ",
  "   ###            ###   ",
];

const APE_EYE_PUPIL = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ##            ##    ",
];

const APE_EYE_HIGHLIGHT = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    #              #    ",
];

const APE_NOSE_BRIDGE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "          ##            ",
  "          ##            ",
];

const APE_NOSE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "         ######         ",
  "        ########        ",
  "        ########        ",
];

const APE_NOSE_SHADE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "        ##    ##        ",
];

const APE_CHEEK_HIGH = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "  ####          ####    ",
  "   ####        ####     ",
  "   ###          ###     ",
];

const APE_MOUTH = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "      ##########        ",
];

const APE_LIP = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "       ########         ",
  "                        ",
  "      ##########        ",
];

const APE_JAW_SHADE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  " ####            ####   ",
  " #####          #####   ",
];

const APE_BODY = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
  "########################",
];

const APE_BODY_SHADE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "##                    ##",
  "###                  ###",
];

const APE_NECK_SHADE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "      ############      ",
];

function drawApe(palette: CreaturePalette): Rect[] {
  return [
    [1, 18, 4, 4, palette.fur2],
    [19, 18, 4, 4, palette.fur2],
    [2, 19, 2, 2, palette.fur3, 0.55],
    [20, 19, 2, 2, palette.fur3, 0.55],
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2),
    ...rectsFromMask(APE_CHEEK_HIGH, palette.fur1),
    ...rectsFromMask(APE_LIP, palette.fur1, 0.85),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_EYE_HIGHLIGHT, palette.spark),
    ...rectsFromMask(APE_NOSE_BRIDGE, palette.shadow, 0.72),
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_NOSE_SHADE, palette.fur2, 0.7),
    [6, 14, 12, 3, palette.fur1, 0.78],
    [7, 17, 10, 2, palette.fur2, 0.65],
    [8, 14, 2, 1, palette.pupil, 0.78],
    [14, 14, 2, 1, palette.pupil, 0.78],
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_JAW_SHADE, palette.shadow, 0.82),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const CAT_SILHOUETTE = [
  "                        ",
  "                        ",
  "    ##            ##    ",
  "   ####          ####   ",
  "  ######        ######  ",
  "  ######        ######  ",
  "  ####################  ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  "  ####################  ",
  "  ####################  ",
  "   ##################   ",
  "                        ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
];

const CAT_INNER_EARS = [
  "                        ",
  "                        ",
  "                        ",
  "    ##            ##    ",
  "    ##            ##    ",
  "    ##            ##    ",
];

function drawCat(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(CAT_SILHOUETTE, palette.fur0),
    ...rectsFromMask(CAT_INNER_EARS, palette.accent, 0.65),
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2, 0.7),
    ...rectsFromMask(APE_CHEEK_HIGH, palette.fur1, 0.7),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_NOSE, palette.accent, 0.85),
    [2, 14, 6, 1, palette.fur3, 0.8],
    [16, 14, 6, 1, palette.fur3, 0.8],
    [3, 16, 5, 1, palette.fur3, 0.55],
    [16, 16, 5, 1, palette.fur3, 0.55],
    ...rectsFromMask(APE_MOUTH, palette.mouth, 0.9),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

/** Floppy ear variant so "Dog" no longer renders as a pointed-eared cat. */
const DOG_SILHOUETTE = [
  "                        ",
  "                        ",
  "  ####              ####",
  "  #####            #####",
  "   ###              ### ",
  "   ###              ### ",
  "    ##              ##  ",
  "    ##              ##  ",
  "  ######################",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  "  ####################  ",
  "  ####################  ",
  "   ##################   ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
];

const DOG_EAR_SHADOW = [
  "                        ",
  "                        ",
  "                        ",
  "   ##            ##     ",
  "   ##            ##     ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawDog(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(DOG_SILHOUETTE, palette.fur0),
    ...rectsFromMask(DOG_EAR_SHADOW, palette.fur2, 0.5),
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2, 0.55),
    ...rectsFromMask(APE_CHEEK_HIGH, palette.fur1, 0.65),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    [8, 13, 8, 4, palette.fur2, 0.85],
    [9, 15, 6, 2, palette.fur3, 0.65],
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth, 0.9),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const MONKEY_EAR_SIDE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "###                  ###",
  "####                ####",
  "###                  ###",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const MONKEY_FACE_LINE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "##                    ##",
  "###                  ###",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawMonkey(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    ...rectsFromMask(MONKEY_EAR_SIDE, palette.fur2),
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2),
    ...rectsFromMask(APE_CHEEK_HIGH, palette.fur1),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_EYE_HIGHLIGHT, palette.spark),
    ...rectsFromMask(APE_NOSE_BRIDGE, palette.shadow, 0.72),
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_NOSE_SHADE, palette.fur2, 0.7),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_JAW_SHADE, palette.shadow, 0.82),
    ...rectsFromMask(MONKEY_FACE_LINE, palette.shadow, 0.55),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const BEAR_ROUND_EARS = [
  "                        ",
  "                        ",
  "    ####        ####    ",
  "   ######      ######   ",
  "   ######      ######   ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawBear(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    ...rectsFromMask(BEAR_ROUND_EARS, palette.fur2),
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur1, 0.65),
    ...rectsFromMask(APE_LIP, palette.fur1, 0.85),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_JAW_SHADE, palette.shadow, 0.8),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const BIRD_HEAD = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "      ###########       ",
  "     #############      ",
  "    ###############     ",
  "    ###############     ",
  "    ###############     ",
  "     #############      ",
  "      ###########       ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const BIRD_BEAK = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "              ####      ",
  "               ####     ",
  "                ##      ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawBird(palette: CreaturePalette): Rect[] {
  const feather = palette.fur0;
  const wing = shadeHex(palette.accent, -0.16);
  const beak = palette.spark;
  return [
    [9, 1, 2, 2, palette.accent],
    [10, 2, 3, 2, palette.accent],
    [11, 3, 2, 2, palette.spark],
    [6, 4, 9, 3, feather],
    [5, 6, 12, 4, feather],
    [4, 9, 12, 5, feather],
    [5, 14, 10, 3, feather],
    [7, 17, 7, 2, feather],
    [15, 8, 5, 2, beak],
    [19, 9, 3, 1, beak],
    [15, 10, 4, 1, palette.metalDark],
    [9, 6, 5, 2, palette.fur2, 0.8],
    [7, 9, 4, 7, wing],
    [8, 11, 6, 2, shadeHex(wing, 0.15)],
    [9, 13, 5, 2, shadeHex(wing, 0.3)],
    [11, 7, 2, 2, palette.eyeIris],
    [12, 7, 1, 1, palette.eyeGlow],
    [11, 19, 1, 3, palette.metal],
    [14, 19, 1, 3, palette.metal],
    [9, 22, 3, 1, palette.metalDark],
    [14, 22, 3, 1, palette.metalDark],
    [5, 20, 13, 3, palette.body0],
    [2, 22, 20, 2, palette.bodyShade],
  ];
}

const HORSE_SNOUT = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "          ##            ",
  "          ##            ",
  "         ####           ",
  "         ####           ",
  "         ####           ",
  "         ####           ",
  "         ####           ",
  "         ####           ",
  "         ####           ",
  "                        ",
  "                        ",
];

const HORSE_MANE = [
  "                        ",
  "       ##        ##     ",
  "      ####      ####    ",
  "      ####      ####    ",
  "       ##        ##     ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawHorse(palette: CreaturePalette): Rect[] {
  const coat = palette.fur0;
  const mane = palette.accent;
  return [
    [7, 1, 3, 6, coat],
    [16, 2, 3, 5, coat],
    [8, 3, 10, 4, coat],
    [7, 6, 11, 6, coat],
    [8, 11, 10, 5, coat],
    [11, 15, 7, 3, coat],
    [16, 9, 5, 4, coat],
    [18, 12, 4, 3, coat],
    [19, 14, 2, 2, palette.shadow, 0.6],
    [7, 4, 3, 12, mane],
    [6, 8, 3, 10, shadeHex(mane, -0.2)],
    [9, 16, 9, 2, palette.fur1],
    [10, 18, 8, 5, palette.body0],
    [15, 20, 7, 3, palette.bodyShade],
    [13, 8, 2, 2, palette.eyeIris],
    [14, 8, 1, 1, palette.eyeGlow],
    [20, 12, 1, 1, palette.nose],
    [18, 15, 2, 1, palette.mouth],
    [11, 6, 6, 1, palette.fur3, 0.72],
    [11, 11, 6, 1, palette.fur2, 0.55],
  ];
}

/** Side-profile pegasus unicorn: fuller wing read, tapered muzzle, 24×24 crisp silhouette. */
const UNICORN_BODY_SIL = [
  "                        ",
  "                        ",
  "                  ##    ",
  "                 ####   ",
  "                ######  ",
  "              ########  ",
  "            ##########  ",
  "          ###########   ",
  "        ######## ###    ",
  "       ########  ###    ",
  "      #######    ###    ",
  "     ######      ###    ",
  "    #####        ###    ",
  "   ####          ###    ",
  "  ###            ####   ",
  " ##             #####   ",
  "##             ######   ",
  "#             #######   ",
  "             ########   ",
  "            ## ## ##    ",
  "            ## ## ##    ",
  "            ## ## ##    ",
  "             # # #      ",
  "              ###       ",
];

const UNICORN_WING_FOLD = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "        ##              ",
  "       ####             ",
  "      ######            ",
  "     ########           ",
  "    #####               ",
  "   ###                  ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const UNICORN_UNDERBELLY = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "              ####      ",
  "             #####      ",
  "              ###       ",
  "                        ",
  "                        ",
  "                        ",
];

const UNICORN_MANE = [
  "                        ",
  "                        ",
  "                        ",
  "               ##       ",
  "              ####      ",
  "             #####      ",
  "            #####       ",
  "           ####         ",
  "          ###           ",
  "         ##             ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const UNICORN_TAIL = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "###                     ",
  "####                    ",
  "#####                   ",
  "####                    ",
  "###                     ",
  " ##                     ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const UNICORN_FOREHEAD_HORN = [
  "                        ",
  "                        ",
  "                        ",
  "                   ##   ",
  "                  ####  ",
  "                   ##   ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawUnicorn(palette: CreaturePalette): Rect[] {
  const pearl = palette.fur0;
  const cheek = palette.fur2;
  const highlight = palette.fur3;
  const shade = palette.shadow;
  const mane = palette.accent;
  const maneDark = shadeHex(palette.accent, -0.22);
  const maneLight = shadeHex(palette.accent, 0.18);
  const horn = palette.spark;
  const hornShade = palette.metalDark;
  return [
    [11, 0, 2, 1, horn],
    [10, 1, 3, 1, horn],
    [10, 2, 4, 1, horn],
    [9, 3, 5, 1, horn],
    [10, 4, 3, 1, hornShade],
    [12, 1, 1, 1, highlight, 0.75],
    [5, 5, 3, 3, pearl],
    [15, 4, 3, 4, pearl],
    [6, 6, 2, 2, palette.fur1],
    [15, 6, 2, 2, palette.fur1],
    [8, 5, 8, 2, pearl],
    [7, 7, 11, 2, pearl],
    [6, 9, 13, 4, pearl],
    [5, 12, 13, 4, pearl],
    [6, 16, 10, 2, pearl],
    [8, 18, 7, 1, pearl],
    [17, 10, 3, 3, pearl],
    [18, 12, 4, 2, pearl],
    [17, 14, 4, 2, pearl],
    [18, 16, 2, 1, shade, 0.75],
    [6, 13, 2, 4, shade, 0.52],
    [8, 17, 6, 2, shade, 0.38],
    [10, 7, 7, 1, highlight, 0.85],
    [8, 9, 8, 1, highlight, 0.78],
    [7, 11, 6, 1, highlight, 0.65],
    [17, 11, 3, 1, cheek, 0.7],
    [18, 13, 3, 1, cheek, 0.5],
    [4, 8, 4, 7, maneDark],
    [3, 11, 4, 7, maneDark],
    [4, 16, 5, 5, maneDark],
    [6, 6, 3, 10, mane],
    [5, 10, 5, 8, mane],
    [6, 18, 6, 3, mane],
    [8, 6, 2, 9, maneLight],
    [7, 12, 2, 7, maneLight],
    [10, 19, 3, 2, maneLight],
    [8, 20, 9, 3, palette.body0],
    [11, 18, 5, 4, palette.body1],
    [14, 20, 7, 3, palette.bodyShade],
    [10, 10, 2, 2, palette.eyeIris],
    [11, 10, 1, 1, palette.eyeGlow],
    [10, 9, 3, 1, palette.brow],
    [20, 13, 1, 1, palette.nose],
    [18, 15, 2, 1, palette.mouth],
    [13, 5, 1, 1, horn, 0.9],
    [16, 2, 1, 1, palette.spark, 0.7],
    [3, 6, 1, 1, palette.spark, 0.65],
    [20, 5, 1, 1, palette.spark, 0.65],
  ];
}

const PUNK_HEAD = [
  "                        ",
  "                        ",
  "     ##############     ",
  "    ################    ",
  "    ################    ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "    ################    ",
  "    ################    ",
  "     ##############     ",
  "                        ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
  "########################",
];

function drawPunk(palette: CreaturePalette): Rect[] {
  return [
    [5, 0, 2, 7, palette.accent],
    [8, 0, 2, 8, palette.spark],
    [11, 0, 2, 7, palette.accent],
    [14, 0, 2, 8, palette.spark],
    [17, 0, 2, 7, palette.accent],
    ...rectsFromMask(PUNK_HEAD, palette.fur0),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeGlow, 0.9),
    ...rectsFromMask(APE_EYE_PUPIL, palette.pupil),
    [10, 14, 4, 1, palette.nose],
    [9, 16, 6, 1, palette.mouth],
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const AZUKI_BANGS = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "      ##########        ",
  "     ############       ",
  "    ##############      ",
  "    ##############      ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const AZUKI_SIDE_LOCKS = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  " ##                  ## ",
  " ##                  ## ",
  " ###                ### ",
  "  ##                ##  ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawAzuki(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    ...rectsFromMask(AZUKI_SIDE_LOCKS, palette.fur2),
    ...rectsFromMask(AZUKI_BANGS, palette.fur2),
    [5, 6, 13, 2, shadeHex(palette.fur2, 0.18)],
    [7, 8, 2, 8, palette.fur2],
    [16, 8, 2, 8, palette.fur2],
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur1, 0.55),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    [9, 11, 1, 1, palette.spark, 0.9],
    [14, 11, 1, 1, palette.spark, 0.9],
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth, 0.85),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const FOX_SILHOUETTE = [
  "                        ",
  "      ##          ##    ",
  "     ####        ####   ",
  "    ######      ######  ",
  "   #######      ####### ",
  "  ##################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  "  ####################  ",
  "   ##################   ",
  "                        ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
  "########################",
];

function drawFox(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(FOX_SILHOUETTE, palette.fur0),
    ...rectsFromMask(CAT_INNER_EARS, palette.accent, 0.55),
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2, 0.65),
    ...rectsFromMask(APE_CHEEK_HIGH, palette.fur1, 0.65),
    [8, 13, 8, 4, palette.fur3, 0.82],
    [10, 16, 4, 2, palette.fur3, 0.7],
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_NOSE, palette.accent, 0.9),
    ...rectsFromMask(APE_MOUTH, palette.mouth, 0.9),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const WOLF_EAR_TIPS = [
  "    ##            ##    ",
  "   ####          ####   ",
  "   ####          ####   ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawWolf(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(DOG_SILHOUETTE, palette.fur0),
    ...rectsFromMask(WOLF_EAR_TIPS, palette.fur2),
    ...rectsFromMask(DOG_EAR_SHADOW, palette.shadow, 0.45),
    [6, 7, 12, 2, palette.shadow, 0.35],
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2, 0.5),
    ...rectsFromMask(APE_CHEEK_HIGH, palette.fur1, 0.6),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth, 0.9),
    [10, 14, 4, 1, palette.mouth, 0.5],
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const ZOMBIE_SCAR = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ##                  ",
  "      ##                ",
  "        ##              ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawZombie(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    [4, 5, 5, 2, palette.shadow, 0.5],
    [15, 4, 4, 3, palette.bodyShade, 0.65],
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2, 0.5),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(ZOMBIE_SCAR, palette.accent, 0.75),
    ...rectsFromMask(APE_JAW_SHADE, palette.shadow, 0.75),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const DEMON_HORNS = [
  "     ##          ##     ",
  "    ####        ####    ",
  "     ##          ##     ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawDemon(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    ...rectsFromMask(DEMON_HORNS, palette.accent),
    [7, 3, 3, 2, palette.spark, 0.7],
    [15, 3, 3, 2, palette.spark, 0.7],
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur1, 0.45),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeGlow, 0.85),
    ...rectsFromMask(APE_EYE_PUPIL, palette.pupil),
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_JAW_SHADE, palette.shadow, 0.85),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const VAMPIRE_COLLAR = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "   ##################   ",
  "  ####################  ",
  " ###################### ",
  "########################",
  "########################",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawVampire(palette: CreaturePalette): Rect[] {
  return [
    [5, 3, 14, 5, palette.mouth],
    [7, 6, 10, 2, palette.shadow],
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur1, 0.45),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    [13, 15, 1, 1, palette.accent],
    [9, 17, 1, 2, palette.spark],
    [14, 17, 1, 2, palette.spark],
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(VAMPIRE_COLLAR, palette.shadow, 0.75),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const SKULL_FACE = [
  "                        ",
  "                        ",
  "      ##########        ",
  "    ##############      ",
  "   ################     ",
  "  ##################    ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  "  ####################  ",
  "   ##################   ",
  "                        ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
  "########################",
];

const SKULL_EYE_BIG = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ####          ####  ",
  "   ######        ###### ",
  "   ######        ###### ",
  "    ####          ####  ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const SKULL_NOSE_HOLE = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "          ####          ",
  "          ####          ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawSkeleton(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(SKULL_FACE, palette.fur0),
    ...rectsFromMask(SKULL_EYE_BIG, palette.shadow),
    ...rectsFromMask(SKULL_NOSE_HOLE, palette.shadow, 0.9),
    [10, 12, 1, 1, palette.eyeGlow],
    [13, 12, 1, 1, palette.eyeGlow],
    [7, 17, 10, 1, palette.shadow, 0.7],
    [8, 18, 1, 1, palette.shadow, 0.7],
    [11, 18, 1, 1, palette.shadow, 0.7],
    [14, 18, 1, 1, palette.shadow, 0.7],
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const LION_MANE_RING = [
  "                        ",
  "   ##################   ",
  " ###################### ",
  "########################",
  "########################",
  " ###################### ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawLion(palette: CreaturePalette): Rect[] {
  return [
    [2, 2, 4, 4, palette.fur2],
    [18, 2, 4, 4, palette.fur2],
    [1, 6, 4, 6, palette.fur2],
    [19, 6, 4, 6, palette.fur2],
    ...rectsFromMask(LION_MANE_RING, palette.fur2),
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur1, 0.55),
    ...rectsFromMask(APE_LIP, palette.fur1, 0.8),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    [8, 13, 8, 4, palette.fur3, 0.8],
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_JAW_SHADE, palette.shadow, 0.82),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const PENGUIN_BODY = [
  "                        ",
  "                        ",
  "       ##########      ",
  "     ###############    ",
  "    #################   ",
  "   ##################   ",
  "   ##################   ",
  "  ########    ########  ",
  "  ########    ########  ",
  "  ###################  ",
  "  ###################  ",
  "   ##################   ",
  "   ##################   ",
  "    ################    ",
  "     ##############     ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
  "########################",
];

const PENGUIN_BELLY = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "         ######         ",
  "         ######         ",
  "        ########        ",
  "        ########        ",
  "        ########        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawPenguin(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(PENGUIN_BODY, palette.fur0),
    ...rectsFromMask(PENGUIN_BELLY, palette.fur3, 0.95),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeGlow, 0.85),
    ...rectsFromMask(APE_EYE_PUPIL, palette.pupil),
    [11, 13, 2, 1, palette.accent],
    [10, 14, 4, 1, palette.accent],
    [7, 19, 3, 1, palette.accent],
    [14, 19, 3, 1, palette.accent],
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const PANDA_PATCHES = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "  ####            ####  ",
  "  ####            ####  ",
  "   ##              ##   ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawPanda(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    ...rectsFromMask(PANDA_PATCHES, palette.shadow, 0.88),
    ...rectsFromMask(BEAR_ROUND_EARS, palette.shadow, 0.75),
    [5, 14, 14, 3, palette.fur3, 0.82],
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur1, 0.4),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const GHOST_SILHOUETTE = [
  "                        ",
  "                        ",
  "      ##########        ",
  "    ##############      ",
  "   ################     ",
  "  ##################    ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ####################   ",
  " ## ## ## ## ## ## ## # ",
  " #   #   #   #   #   #  ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
];

const GHOST_EYE_HOLLOW = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "   ####          ####   ",
  "   ####          ####   ",
  "   ####          ####   ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const GHOST_MOUTH_O = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "        ########        ",
  "        ########        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawGhost(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(GHOST_SILHOUETTE, palette.fur0, 0.88),
    [3, 5, 18, 10, palette.fur3, 0.14],
    ...rectsFromMask(GHOST_EYE_HOLLOW, palette.shadow, 0.75),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeGlow, 0.35),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeIris, 0.65),
    ...rectsFromMask(GHOST_MOUTH_O, palette.mouth, 0.6),
    ...rectsFromMask(APE_BODY, palette.body0, 0.75),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade, 0.65),
  ];
}

const MEME_MOUTH = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ################    ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

const MEME_EYE_BAGS = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "  ########      ########",
  "  ########      ########",
  "  ########      ########",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
];

function drawMeme(palette: CreaturePalette): Rect[] {
  return [
    ...rectsFromMask(APE_SILHOUETTE, palette.fur0),
    [3, 4, 5, 5, palette.spark],
    [17, 3, 3, 3, palette.accent],
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2),
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(MEME_EYE_BAGS, palette.fur2, 0.45),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    [8, 11, 3, 3, palette.eyeGlow],
    [13, 11, 3, 3, palette.eyeGlow],
    [9, 12, 1, 1, palette.shadow],
    [14, 12, 1, 1, palette.shadow],
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(MEME_MOUTH, palette.mouth),
    ...rectsFromMask(APE_JAW_SHADE, palette.shadow, 0.6),
    ...rectsFromMask(APE_NECK_SHADE, palette.bodyShade),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const ROBOT_PLATE = [
  "                        ",
  "                        ",
  "                        ",
  "       ##########       ",
  "      ############      ",
  "      ############      ",
  "    ################    ",
  "    ################    ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "    ################    ",
  "    ################    ",
  "      ############      ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
];

const ROBOT_VISOR = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ################    ",
  "    ################    ",
  "    ################    ",
];

const ROBOT_EYE_LED = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "      ##        ##      ",
  "      ##        ##      ",
];

function drawRobot(palette: CreaturePalette): Rect[] {
  return [
    [11, 0, 2, 3, palette.metal],
    [10, 0, 4, 1, palette.accent],
    ...rectsFromMask(ROBOT_PLATE, palette.fur1),
    ...rectsFromMask(ROBOT_PLATE, palette.fur2, 0.4),
    ...rectsFromMask(ROBOT_VISOR, palette.mouth),
    ...rectsFromMask(ROBOT_EYE_LED, palette.eyeGlow),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
    [4, 16, 16, 1, palette.shadow, 0.4],
    [10, 18, 4, 1, palette.metalDark],
    [5, 5, 14, 1, palette.metal, 0.65],
    [6, 15, 12, 1, palette.metalDark, 0.65],
  ];
}

const DRAGON_HEAD = [
  "                        ",
  "                        ",
  "       ##         ##    ",
  "      ####       ####   ",
  "      #####      ####   ",
  "    #################   ",
  "   ###################  ",
  "   ###################  ",
  "  ##################### ",
  "  ##################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  " ###################### ",
  "  ##################### ",
  "  ##################### ",
  "   ###################  ",
  "    #################   ",
  "     ###############    ",
  "       ###########      ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
];

const DRAGON_HORN_HIGHLIGHT = [
  "                        ",
  "                        ",
  "                        ",
  "      ###       ###     ",
];

function drawDragon(palette: CreaturePalette): Rect[] {
  return [
    [1, 11, 4, 6, palette.accent, 0.65],
    [19, 11, 4, 6, palette.accent, 0.65],
    ...rectsFromMask(DRAGON_HEAD, palette.fur0),
    ...rectsFromMask(DRAGON_HORN_HIGHLIGHT, palette.metal, 0.85),
    [17, 12, 5, 2, palette.accent],
    [20, 13, 2, 1, palette.spark],
    ...rectsFromMask(APE_BROW, palette.brow),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_NOSE, palette.nose),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const ALIEN_SILHOUETTE = [
  "                        ",
  "                        ",
  "        ########        ",
  "      ############      ",
  "    ################    ",
  "    ################    ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "   ##################   ",
  "    ################    ",
  "    ################    ",
  "     ##############     ",
  "      ############      ",
  "       ##########       ",
  "        ########        ",
  "                        ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
];

const ALIEN_BIG_EYES = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ####       ####     ",
  "   ######     ######    ",
  "   ######     ######    ",
  "   ######     ######    ",
  "    ####       ####     ",
];

const ALIEN_PUPIL_DOTS = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "    ##         ##       ",
  "    ##         ##       ",
];

function drawAlien(palette: CreaturePalette): Rect[] {
  return [
    [9, 0, 1, 3, palette.accent],
    [15, 0, 1, 3, palette.accent],
    [8, 0, 2, 1, palette.spark],
    [15, 0, 2, 1, palette.spark],
    ...rectsFromMask(ALIEN_SILHOUETTE, palette.fur0),
    ...rectsFromMask(ALIEN_BIG_EYES, palette.shadow),
    ...rectsFromMask(ALIEN_PUPIL_DOTS, palette.eyeGlow),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

const FROG_SILHOUETTE = [
  "                        ",
  "                        ",
  "        ########        ",
  "       ##########       ",
  "      ############      ",
  "    ################    ",
  "   ##################   ",
  "  ####################  ",
  "  ####################  ",
  "  ####################  ",
  "  ####################  ",
  "  ####################  ",
  "  ####################  ",
  "  ####################  ",
  "  ####################  ",
  "   ##################   ",
  "    ################    ",
  "      ############      ",
  "        ########        ",
  "                        ",
  "                        ",
  "    ################    ",
  "  ####################  ",
  "########################",
];

function drawFrog(palette: CreaturePalette): Rect[] {
  return [
    [5, 2, 5, 5, palette.fur2],
    [15, 2, 5, 5, palette.fur2],
    ...rectsFromMask(FROG_SILHOUETTE, palette.fur0),
    [6, 4, 3, 3, palette.shadow],
    [16, 4, 3, 3, palette.shadow],
    [7, 5, 1, 1, palette.eyeGlow],
    [17, 5, 1, 1, palette.eyeGlow],
    ...rectsFromMask(APE_HIGHLIGHT_TOP, palette.fur2, 0.6),
    ...rectsFromMask(APE_EYE_SOCKET, palette.shadow),
    ...rectsFromMask(APE_EYE_GLOW, palette.eyeIris),
    ...rectsFromMask(APE_EYE_PUPIL, palette.eyeGlow),
    ...rectsFromMask(APE_MOUTH, palette.mouth),
    ...rectsFromMask(APE_BODY, palette.body0),
    ...rectsFromMask(APE_BODY_SHADE, palette.bodyShade),
  ];
}

function drawAgent(palette: CreaturePalette): Rect[] {
  return [
    ...drawApe(palette),
    [4, 2, 16, 4, palette.mouth, 0.95],
    [6, 4, 12, 3, palette.shadow, 0.95],
    [3, 9, 18, 2, palette.metalDark, 0.85],
    [5, 10, 6, 2, palette.eyeGlow],
    [14, 10, 5, 2, palette.eyeGlow],
    [2, 20, 20, 4, palette.mouth],
    [5, 20, 5, 4, palette.fur3, 0.9],
    [12, 20, 2, 4, palette.accent],
  ];
}

function drawWizard(palette: CreaturePalette): Rect[] {
  return [
    ...drawApe(palette),
    ...drawWizardHat(palette, () => 0.9),
    [2, 18, 20, 6, palette.accent, 0.82],
    [6, 16, 12, 5, palette.fur3, 0.78],
    [8, 17, 8, 2, palette.spark, 0.7],
    [4, 21, 2, 2, palette.spark],
    [18, 20, 2, 2, palette.spark],
  ];
}

function drawSamurai(palette: CreaturePalette): Rect[] {
  return [
    ...drawApe(palette),
    ...drawSamuraiHelm(palette),
    [3, 18, 18, 5, palette.bodyShade],
    [5, 18, 14, 1, palette.metal],
    [6, 20, 12, 1, palette.accent],
    [3, 14, 18, 1, palette.metalDark],
    [5, 15, 14, 1, palette.metal, 0.75],
  ];
}

function drawNinja(palette: CreaturePalette): Rect[] {
  const cloth = palette.mouth;
  return [
    [7, 2, 10, 2, cloth],
    [5, 3, 14, 3, cloth],
    [4, 4, 16, 15, cloth],
    [6, 5, 12, 2, palette.bodyShade],
    [3, 8, 18, 8, cloth],
    [2, 11, 4, 5, cloth],
    [18, 11, 4, 5, cloth],
    [5, 9, 14, 3, palette.shadow],
    [6, 8, 12, 1, palette.bodyShade],
    [7, 10, 3, 1, palette.eyeGlow],
    [14, 10, 3, 1, palette.eyeGlow],
    [8, 10, 1, 1, palette.spark],
    [15, 10, 1, 1, palette.spark],
    [6, 13, 12, 2, palette.bodyShade],
    [8, 15, 8, 1, palette.accent],
    [9, 16, 6, 1, palette.spark, 0.6],
    [4, 19, 16, 5, palette.body0],
    [6, 18, 12, 2, cloth],
    [8, 19, 8, 1, palette.bodyShade],
    [7, 21, 3, 3, palette.accent, 0.65],
    [14, 21, 3, 3, palette.accent, 0.65],
    [1, 21, 6, 2, palette.shadow],
    [17, 21, 6, 2, palette.shadow],
    [2, 20, 4, 1, palette.metalDark],
    [18, 20, 4, 1, palette.metalDark],
    [18, 3, 4, 2, palette.accent],
    [20, 2, 2, 1, palette.spark],
  ];
}

function drawSports(palette: CreaturePalette): Rect[] {
  return [
    ...drawApe(palette),
    [4, 3, 16, 5, palette.accent],
    [16, 6, 6, 2, palette.accent],
    [7, 5, 6, 1, palette.spark],
    [3, 19, 18, 5, palette.fur3],
    [4, 19, 16, 1, palette.mouth, 0.5],
    [11, 19, 2, 5, palette.accent],
    [9, 21, 6, 2, palette.spark, 0.72],
  ];
}

function drawCustom(palette: CreaturePalette): Rect[] {
  return [
    ...drawRobot(palette),
    [2, 2, 3, 3, palette.spark],
    [19, 3, 2, 2, palette.accent],
    [4, 18, 16, 1, palette.eyeGlow, 0.65],
    [6, 20, 12, 1, palette.spark, 0.45],
  ];
}

function drawSubject(subject: SubjectKey, palette: CreaturePalette): Rect[] {
  switch (subject) {
    case "agent":
      return drawAgent(palette);
    case "cat":
      return drawCat(palette);
    case "dog":
      return drawDog(palette);
    case "robot":
      return drawRobot(palette);
    case "dragon":
      return drawDragon(palette);
    case "alien":
      return drawAlien(palette);
    case "frog":
      return drawFrog(palette);
    case "monkey":
      return drawMonkey(palette);
    case "bear":
      return drawBear(palette);
    case "bird":
      return drawBird(palette);
    case "horse":
      return drawHorse(palette);
    case "unicorn":
      return drawUnicorn(palette);
    case "punk":
      return drawPunk(palette);
    case "azuki":
      return drawAzuki(palette);
    case "fox":
      return drawFox(palette);
    case "wolf":
      return drawWolf(palette);
    case "zombie":
      return drawZombie(palette);
    case "demon":
      return drawDemon(palette);
    case "vampire":
      return drawVampire(palette);
    case "skeleton":
      return drawSkeleton(palette);
    case "lion":
      return drawLion(palette);
    case "penguin":
      return drawPenguin(palette);
    case "panda":
      return drawPanda(palette);
    case "ghost":
      return drawGhost(palette);
    case "meme":
      return drawMeme(palette);
    case "wizard":
      return drawWizard(palette);
    case "samurai":
      return drawSamurai(palette);
    case "ninja":
      return drawNinja(palette);
    case "sports":
      return drawSports(palette);
    case "custom":
      return drawCustom(palette);
    case "ape":
    default:
      return drawApe(palette);
  }
}

function drawAccessory(accessory: AccessoryKey, palette: CreaturePalette, rng: () => number): Rect[] {
  switch (accessory) {
    case "wizard_hat":
      return drawWizardHat(palette, rng);
    case "fire_mohawk":
      return drawFireMohawk(palette);
    case "gold_chain":
      return drawGoldChain(palette);
    case "crown":
      return drawCrown(palette);
    case "halo":
      return drawHalo(palette);
    case "visor":
      return drawVisor(palette);
    case "bandanna":
      return drawBandanna(palette);
    case "samurai_helm":
      return drawSamuraiHelm(palette);
    case "headphones":
      return drawHeadphones(palette);
    case "signal_horns":
      return drawSignalHorns(palette);
    case "ninja_mask":
      return drawNinjaMask(palette);
    case "cigar":
      return drawCigar(palette);
    case "none":
    default:
      return [];
  }
}

function drawWizardHat(palette: CreaturePalette, rng: () => number): Rect[] {
  const hat = palette.accent;
  const trim = palette.metal;
  const trimDark = palette.metalDark;
  const star = palette.spark;
  const rects: Rect[] = [];
  // Conical hat tapering from a 2px tip down to a wide brim. Sits in rows 0-6 so the
  // forehead, brow ridge, and eyes (rows 8-11 of the ape silhouette) stay fully visible.
  const HAT_BODY = [
    "          ##            ",
    "         ####           ",
    "         ####           ",
    "        ######          ",
    "       ########         ",
    "      ##########        ",
    "     ############       ",
  ];
  rects.push(...rectsFromMask(HAT_BODY, hat));
  // Brim drawn one row below the cone tip ends. Slight under-shadow at row 8 sells the
  // hat sitting on the forehead.
  const HAT_BRIM = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "######################  ",
  ];
  rects.push(...rectsFromMask(HAT_BRIM, trim));
  rects.push([0, 8, 22, 1, trimDark, 0.6]);
  // Stars stay on the cone (cols 6-17, rows 1-5) so they never land on the face.
  const starSpots: Array<[number, number, boolean]> = [
    [10, 1, true],
    [11, 3, false],
    [9, 4, false],
    [13, 4, false],
    [8, 5, false],
    [14, 5, false],
  ];
  starSpots.forEach(([x, y, mandatory]) => {
    if (mandatory || rng() > 0.4) {
      rects.push([x, y, 1, 1, star]);
    }
  });
  return rects;
}

function drawFireMohawk(palette: CreaturePalette): Rect[] {
  const flame0 = palette.accent;
  const flame1 = palette.spark;
  const FLAME_BASE = [
    "                        ",
    "      ##          ##    ",
    "     ####        ####   ",
    "     ####        ####   ",
    "      ##          ##    ",
    "       ####    ####     ",
    "        ##########      ",
    "         ########       ",
    "         ########       ",
    "          ######        ",
  ];
  const FLAME_HIGHLIGHT = [
    "                        ",
    "                        ",
    "      ##          ##    ",
    "      ##          ##    ",
    "                        ",
    "        ####    ####    ",
    "         ########       ",
    "          ######        ",
  ];
  return [
    ...rectsFromMask(FLAME_BASE, flame0),
    ...rectsFromMask(FLAME_HIGHLIGHT, flame1),
  ];
}

function drawGoldChain(palette: CreaturePalette): Rect[] {
  const gold = palette.metal;
  const goldDark = palette.metalDark;
  const PENDANT = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "  #  #  #  #  #  #  #   ",
    "                        ",
    "  #  #  #  #  #  #  #   ",
  ];
  const PENDANT_DARK = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "    ###############     ",
  ];
  return [
    ...rectsFromMask(PENDANT_DARK, goldDark, 0.6),
    ...rectsFromMask(PENDANT, gold),
  ];
}

function drawCrown(palette: CreaturePalette): Rect[] {
  const gold = palette.metal;
  const goldDark = palette.metalDark;
  const spark = palette.spark;
  const CROWN_BODY = [
    "                        ",
    "                        ",
    "    ##  ##  ####  ##  ##",
    "   ####  ####  ####  ###",
    "   ####################",
    "   ####################",
    "   ####################",
  ];
  const CROWN_GEMS = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "    ##    ##    ##      ",
  ];
  return [
    ...rectsFromMask(CROWN_BODY, gold),
    ...rectsFromMask(CROWN_GEMS, spark),
    [3, 6, 18, 1, goldDark, 0.6],
  ];
}

function drawHalo(palette: CreaturePalette): Rect[] {
  const ring = palette.spark;
  const HALO = [
    "                        ",
    "      ############      ",
    "    ################    ",
    "      ############      ",
  ];
  return [
    ...rectsFromMask(HALO, ring, 0.85),
    [4, 1, 16, 1, ring, 0.5],
  ];
}

function drawVisor(palette: CreaturePalette): Rect[] {
  const visor = palette.eyeGlow;
  const frame = palette.mouth;
  const FRAME = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "  ####################  ",
    "  ####################  ",
    "  ####################  ",
    "  ####################  ",
  ];
  const LENS = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "   ###             ###  ",
    "   ###             ###  ",
  ];
  return [
    ...rectsFromMask(FRAME, frame),
    ...rectsFromMask(LENS, visor, 0.85),
  ];
}

function drawBandanna(palette: CreaturePalette): Rect[] {
  const cloth = palette.accent;
  const dot = palette.spark;
  const BAND = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    " ####################   ",
    " ####################   ",
  ];
  const DOTS = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "    ##    ##    ##      ",
  ];
  return [
    ...rectsFromMask(BAND, cloth),
    ...rectsFromMask(DOTS, dot, 0.85),
  ];
}

function drawSamuraiHelm(palette: CreaturePalette): Rect[] {
  const helm = palette.body0;
  const trim = palette.metal;
  const HELM = [
    "                        ",
    "                        ",
    "      ############      ",
    "    ################    ",
    "   ##################   ",
    "  ####################  ",
    " ###################### ",
  ];
  const TRIM = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    " ###################### ",
  ];
  const HORNS = [
    "                        ",
    "    ####        ####    ",
    "    ####        ####    ",
  ];
  return [
    ...rectsFromMask(HELM, helm),
    ...rectsFromMask(HORNS, trim),
    ...rectsFromMask(TRIM, trim),
  ];
}

function drawHeadphones(palette: CreaturePalette): Rect[] {
  const cup = palette.mouth;
  const accent = palette.accent;
  const CUP_BAND = [
    "                        ",
    "                        ",
    "                        ",
    "      ############      ",
    "    ################    ",
  ];
  const CUPS = [
    "                        ",
    "                        ",
    "  ####            ####  ",
    "  ####            ####  ",
    "  ####            ####  ",
    "  ####            ####  ",
  ];
  return [
    ...rectsFromMask(CUP_BAND, cup),
    ...rectsFromMask(CUPS, cup),
    [3, 5, 4, 1, accent, 0.85],
    [17, 5, 4, 1, accent, 0.85],
  ];
}

function drawSignalHorns(palette: CreaturePalette): Rect[] {
  const horn = palette.metal;
  const HORNS = [
    "                        ",
    "    ##            ##    ",
    "   ####          ####   ",
    "   ####          ####   ",
    "    ##            ##    ",
  ];
  return rectsFromMask(HORNS, horn);
}

function drawNinjaMask(palette: CreaturePalette): Rect[] {
  const cloth = palette.mouth;
  const MASK = [
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    "                        ",
    " ###################### ",
    " ###################### ",
    " ###################### ",
    " ###################### ",
    " ###################### ",
    " ###################### ",
  ];
  return rectsFromMask(MASK, cloth);
}

function drawCigar(palette: CreaturePalette): Rect[] {
  const wrap = "#5b3a23";
  const tip = palette.spark;
  return [
    [16, 17, 6, 1, wrap],
    [22, 17, 1, 1, tip, 0.85],
  ];
}

function drawBackground(bg: BackgroundKey, palette: CreaturePalette, rng: () => number): Rect[] {
  const rects: Rect[] = [[0, 0, 24, 24, palette.bg]];
  if (bg === "solid") {
    return rects;
  }
  if (bg === "stars") {
    const count = 10;
    for (let i = 0; i < count; i += 1) {
      const x = Math.floor(rng() * 22) + 1;
      const y = Math.floor(rng() * 22) + 1;
      rects.push([x, y, 1, 1, palette.spark, 0.85]);
    }
    return rects;
  }
  if (bg === "grid") {
    for (let i = 4; i < 24; i += 6) {
      rects.push([0, i, 24, 1, palette.bgAlt, 0.22]);
      rects.push([i, 0, 1, 24, palette.bgAlt, 0.22]);
    }
    return rects;
  }
  if (bg === "vignette") {
    rects.push([2, 2, 20, 20, palette.bgAlt, 0.35]);
    rects.push([5, 5, 14, 14, palette.bg, 0.45]);
    return rects;
  }
  if (bg === "dust") {
    for (let i = 0; i < 18; i += 1) {
      const x = Math.floor(rng() * 24);
      const y = Math.floor(rng() * 24);
      rects.push([x, y, 1, 1, palette.bgAlt, 0.6]);
    }
    return rects;
  }
  if (bg === "horizon") {
    rects.push([0, 18, 24, 6, palette.bgAlt, 0.55]);
    rects.push([0, 22, 24, 2, palette.accent, 0.18]);
    return rects;
  }
  return rects;
}

function rarityFromRank(rank: number): RenderModel["rarity"] {
  if (rank > 9850) return "Mythic";
  if (rank > 9200) return "Rare";
  if (rank > 7000) return "Uncommon";
  return "Common";
}

function normalizeSubjectV3(value: unknown): SubjectKey {
  const subject = String(value || "ape").toLowerCase();
  return (SUBJECT_LABELS[subject as SubjectKey] ? subject : "custom") as SubjectKey;
}

function normalizeAccessory(value: unknown, fallback: AccessoryKey, rng: () => number): AccessoryKey {
  const accessory = String(value || "").toLowerCase();
  if (ACCESSORY_LABELS[accessory as AccessoryKey]) return accessory as AccessoryKey;
  if (fallback === "none") {
    const pool: AccessoryKey[] = [
      "none",
      "wizard_hat",
      "fire_mohawk",
      "gold_chain",
      "crown",
      "halo",
      "visor",
      "bandanna",
      "headphones",
      "samurai_helm",
      "signal_horns",
      "ninja_mask",
    ];
    // Bias toward bare heads so silhouettes read clearly; accessories still show often.
    if (rng() < 0.46) return "none";
    const decorated = pool.filter((item) => item !== "none");
    return pick(decorated, rng);
  }
  return fallback;
}

function normalizeBackground(value: unknown, rng: () => number): BackgroundKey {
  const v = String(value || "").toLowerCase();
  const allowed: BackgroundKey[] = ["solid", "stars", "grid", "vignette", "dust", "horizon"];
  if (allowed.includes(v as BackgroundKey)) return v as BackgroundKey;
  const weighted: BackgroundKey[] = [
    "solid",
    "solid",
    "solid",
    "solid",
    "vignette",
    "vignette",
    "horizon",
    "stars",
    "dust",
    "grid",
  ];
  return pick(weighted, rng);
}

function normalizePaletteName(value: unknown, rng: () => number): string {
  const palette = String(value || "").toLowerCase();
  if (palette && palette !== "auto" && PALETTE_SPECS[palette]) return palette;
  return pick(Object.keys(PALETTE_SPECS), rng);
}

function normalizeVibe(value: unknown, rng: () => number): string {
  const vibe = String(value || "").toLowerCase();
  const allowed = ["balanced", "loud", "holy", "dark"];
  if (allowed.includes(vibe)) return vibe;
  return pick(allowed, rng);
}

function buildModel(input: ClawPegRenderInput): RenderModel {
  const seed = input.seed || deriveSeedV3(input);
  const rng = createRng(hashUint32(seed));
  const params = input.params || {};
  const subject = normalizeSubjectV3(params.subject);
  const paletteName = normalizePaletteName(params.palette, rng);
  const spec = PALETTE_SPECS[paletteName] || PALETTE_SPECS.claw;
  const vibe = normalizeVibe(params.vibe, rng);
  const palette = buildCreaturePalette(spec, subject, vibe);
  const accessory = normalizeAccessory(params.accessory, "none", rng);
  const background = normalizeBackground(params.background, rng);
  const rank = hashUint32(`${seed}:rank`) % 10_000;
  return {
    seed,
    rng,
    subject,
    paletteName,
    palette,
    background,
    accessory,
    pose: String(params.pose || "front"),
    vibe,
    rank,
    rarity: rarityFromRank(rank),
  };
}

function deriveSeedV3(input: Omit<ClawPegRenderInput, "seed">): string {
  const source = [
    input.rendererId,
    input.rendererVersion,
    input.collectionSeed,
    input.tokenMint,
    String(input.pegId),
    JSON.stringify(input.params || {}),
  ].join(":");
  return hashUint32(source).toString(16).padStart(8, "0");
}

/** Native SVG default aspect is not 1:1 in many browsers → <img object-cover> cropped identity art. Logical grid is 24; we export 48×48 crisp blocks. */
const IDENTITY_EXPORT_SCALE = 2;
const IDENTITY_LOGICAL = 24;

function rectToSvgIdentity(rect: Rect): string {
  const s = IDENTITY_EXPORT_SCALE;
  const [x, y, w, h, fill, opacity] = rect;
  const sx = x * s;
  const sy = y * s;
  const sw = w * s;
  const sh = h * s;
  if (opacity !== undefined) {
    return `<rect x='${sx}' y='${sy}' width='${sw}' height='${sh}' fill='${fill}' opacity='${opacity}'/>`;
  }
  return `<rect x='${sx}' y='${sy}' width='${sw}' height='${sh}' fill='${fill}'/>`;
}

function rectToString(rect: Rect): string {
  const [x, y, w, h, fill, opacity] = rect;
  if (opacity !== undefined) {
    return `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}' opacity='${opacity}'/>`;
  }
  return `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}'/>`;
}

export function renderClawPegSvgV3(input: ClawPegRenderInput): string {
  const model = buildModel(input);
  const rects: Rect[] = [];
  rects.push(...drawBackground(model.background, model.palette, model.rng));
  rects.push(...drawSubject(model.subject, model.palette));
  rects.push(...drawAccessory(model.accessory, model.palette, model.rng));

  const dim = IDENTITY_LOGICAL * IDENTITY_EXPORT_SCALE;
  const out: string[] = [
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${dim} ${dim}' width='${dim}' height='${dim}' shape-rendering='crispEdges'>`,
    rects.map(rectToSvgIdentity).join(""),
    "</svg>",
  ];
  return out.join("");
}

export function renderClawPegTradeArtSvgV3(input: ClawPegTradeArtRenderInput): string {
  const seed = input.seed || deriveTradeArtSeedV3(input);
  const rng = createRng(hashUint32(seed));
  const params = input.params || {};
  const paletteNames = Object.keys(PALETTE_SPECS);
  const paletteName = pick(paletteNames, rng);
  const spec = PALETTE_SPECS[paletteName] || PALETTE_SPECS.cyber;
  const vibes = ["balanced", "loud", "holy", "dark"];
  const vibe = pick(vibes, rng);
  const palette = buildCreaturePalette(spec, normalizeSubjectV3(params.subject), vibe);
  const rects: Rect[] = [];
  rects.push([0, 0, 24, 24, palette.bg]);
  rects.push([0, 0, 24, 1, palette.accent]);
  rects.push([0, 23, 24, 1, palette.eyeGlow]);

  const amountIn = Number(BigInt(String(input.amountIn)) % BigInt(10_000));
  const amountOut = Number(BigInt(String(input.amountOut)) % BigInt(10_000));

  for (let i = 0; i < 10; i += 1) {
    const value = hashUint32(`${seed}:b:${i}:${amountIn}:${amountOut}`);
    const height = 2 + (value % 14);
    const x = 2 + i * 2;
    const color = i % 3 === 0 ? palette.accent : i % 3 === 1 ? palette.spark : palette.metal;
    rects.push([x, 22 - height, 1, height, color, 0.95]);
  }

  for (let i = 0; i < 8; i += 1) {
    const x = Math.floor(rng() * 22) + 1;
    const y = Math.floor(rng() * 8) + 2;
    rects.push([x, y, 1, 1, palette.spark, 0.7]);
  }

  rects.push([8, 8, 8, 6, palette.fur0]);
  rects.push([10, 10, 1, 1, palette.eyeGlow]);
  rects.push([13, 10, 1, 1, palette.eyeGlow]);
  rects.push([10, 12, 4, 1, palette.mouth]);

  return [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24' shape-rendering='crispEdges'>",
    rects.map(rectToString).join(""),
    "</svg>",
  ].join("");
}

function deriveTradeArtSeedV3(input: ClawPegTradeArtRenderInput): string {
  const source = [
    input.rendererId,
    input.rendererVersion,
    input.collectionSeed,
    input.tokenMint,
    String(input.tradeIndex),
    input.trader,
    input.inputMint,
    input.outputMint,
    String(input.amountIn),
    String(input.amountOut),
    String(input.slot),
    JSON.stringify(input.params || {}),
  ].join(":");
  return hashUint32(source).toString(16).padStart(8, "0");
}

export function getClawPegTraitsV3(input: ClawPegRenderInput) {
  const model = buildModel(input);
  return {
    seed: model.seed,
    rarity: model.rarity,
    rank: model.rank,
    subject: model.subject,
    subject_label: SUBJECT_LABELS[model.subject],
    palette: model.paletteName,
    accessory: model.accessory,
    accessory_label: ACCESSORY_LABELS[model.accessory],
    background: model.background,
    vibe: model.vibe,
    renderer: `${input.rendererId}@${input.rendererVersion}`,
    image_model: "deterministic-svg-v3",
    canonical_source: "renderer-rule",
  };
}

export const CLAWPEG_RENDERER_V3_SUBJECTS = Object.keys(SUBJECT_LABELS) as SubjectKey[];
export const CLAWPEG_RENDERER_V3_ACCESSORIES = Object.keys(ACCESSORY_LABELS) as AccessoryKey[];
export const CLAWPEG_RENDERER_V3_PALETTES = Object.keys(PALETTE_SPECS);
