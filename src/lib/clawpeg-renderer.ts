import {
  getClawPegTraitsV3,
  renderClawPegSvgV3,
  renderClawPegTradeArtSvgV3,
} from "./clawpeg-renderer-v3";

export interface ClawPegRenderInput {
  rendererId: string;
  rendererVersion: string;
  collectionSeed: string;
  tokenMint: string;
  pegId: number;
  seed?: string;
  params?: Record<string, unknown>;
}

export interface ClawPegTradeArtRenderInput {
  rendererId: string;
  rendererVersion: string;
  collectionSeed: string;
  tokenMint: string;
  tradeIndex: bigint | number;
  trader: string;
  inputMint: string;
  outputMint: string;
  amountIn: bigint | number | string;
  amountOut: bigint | number | string;
  slot: bigint | number | string;
  seed?: string;
  params?: Record<string, unknown>;
}

type SubjectKey =
  | "agent"
  | "monkey"
  | "ape"
  | "horse"
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
  | "sports"
  | "meme"
  | "custom";

type Rect = [number, number, number, number, string, number?];

interface RenderModel {
  seed: string;
  rng: () => number;
  subject: SubjectKey;
  palette: string[];
  paletteName: string;
  style: string;
  vibe: string;
  background: string;
  pose: string;
  accessory: string;
  marking: string;
  aura: string;
  rarity: string;
  rank: number;
}

const PALETTES = [
  ["#08070a", "#f7f2df", "#fa5246", "#53c7ff", "#f4c95d"],
  ["#111315", "#f2f7f2", "#8be36b", "#ec5cff", "#4a74ff"],
  ["#100f14", "#f8efe3", "#ff7a3d", "#2de2e6", "#ffe66d"],
  ["#06111f", "#edf7ff", "#ff3864", "#20c997", "#b197fc"],
];

const NAMED_PALETTES: Record<string, string[]> = {
  claw: ["#090909", "#f7f2df", "#fa5246", "#53c7ff", "#f4c95d"],
  jungle: ["#07130a", "#f2f7d8", "#43d17a", "#f2b84b", "#8b5e34"],
  candy: ["#160a1d", "#fff4f8", "#ff5db1", "#6ee7ff", "#ffe66d"],
  cyber: ["#07101f", "#edf7ff", "#28f2ff", "#ff3df2", "#9dff57"],
  volcanic: ["#130605", "#fff1de", "#ff4d2d", "#ffb000", "#6d2cff"],
  frost: ["#06111f", "#f4fbff", "#80dfff", "#8aa4ff", "#ffffff"],
  gold: ["#100d06", "#fff4cc", "#dba542", "#fff06a", "#6f4c1e"],
  monochrome: ["#080808", "#f4f4f4", "#7c7c7c", "#d4d4d4", "#2a2a2a"],
};

const SUBJECT_LABELS: Record<SubjectKey, string> = {
  agent: "Agent",
  monkey: "Monkey",
  ape: "Ape",
  horse: "Horse",
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
  sports: "Sports",
  meme: "Meme",
  custom: "Custom",
};

function hashToUint32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number) {
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

function rect([x, y, w, h, fill, opacity]: Rect) {
  return `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}'${opacity !== undefined ? ` opacity='${opacity}'` : ""}/>`;
}

function renderRects(rects: Rect[]) {
  return rects.map(rect).join("");
}

function normalizeSubject(value: unknown): SubjectKey {
  const subject = String(value || "agent").toLowerCase();
  return (SUBJECT_LABELS[subject as SubjectKey] ? subject : "custom") as SubjectKey;
}

function rarityFromRank(rank: number) {
  return rank > 9850 ? "Mythic" : rank > 9200 ? "Rare" : rank > 7000 ? "Uncommon" : "Common";
}

export function deriveClawPegSeed(input: Omit<ClawPegRenderInput, "seed">): string {
  const source = [
    input.rendererId,
    input.rendererVersion,
    input.collectionSeed,
    input.tokenMint,
    String(input.pegId),
    JSON.stringify(input.params || {}),
  ].join(":");
  return hashToUint32(source).toString(16).padStart(8, "0");
}

function buildRenderModel(input: ClawPegRenderInput): RenderModel {
  const seed = input.seed || deriveClawPegSeed(input);
  const rng = createRng(hashToUint32(seed));
  const params = input.params || {};
  const subject = normalizeSubject(params.subject);
  const paletteName = String(params.palette || "claw").toLowerCase();
  const palette = NAMED_PALETTES[paletteName] || pick(PALETTES, rng);
  const style = String(params.style || "pixel-pfp").toLowerCase();
  const vibe = String(params.vibe || "balanced").toLowerCase();
  const rank = hashToUint32(`${seed}:rank`) % 10_000;

  return {
    seed,
    rng,
    subject,
    palette,
    paletteName,
    style,
    vibe,
    background: pick(["solid", "split", "diagonal", "grid", "spotlight", "horizon"], rng),
    pose: subject === "horse" || subject === "dragon"
      ? pick(["standing", "charging", "winged", "relic"], rng)
      : pick(["front", "wide", "low", "masked"], rng),
    accessory: pick(["none", "crown", "visor", "halo", "horns", "scarf", "headband", "signal"], rng),
    marking: pick(["clean", "blaze", "stripes", "spots", "socks", "chrome", "warpaint", "patch"], rng),
    aura: pick(["none", "spark", "moon", "glitch", "relic", "embers"], rng),
    rarity: rarityFromRank(rank),
    rank,
  };
}

function createScene(model: RenderModel): Rect[] {
  const { palette, rng, vibe, background } = model;
  const [bg, , accent, secondary, gold] = palette;
  const rects: Rect[] = [[0, 0, 64, 64, bg]];
  const loud = vibe === "loud";

  if (background === "split") {
    rects.push([0, 0, 64, 32, secondary, 0.18], [0, 32, 64, 32, accent, 0.1]);
  } else if (background === "diagonal") {
    for (let i = 0; i < 9; i += 1) rects.push([i * 8, 0, 8, Math.max(4, 60 - i * 6), secondary, 0.18]);
  } else if (background === "grid") {
    for (let i = 8; i < 64; i += 12) rects.push([i, 0, 1, 64, secondary, 0.18], [0, i, 64, 1, accent, 0.14]);
  } else if (background === "spotlight") {
    rects.push([17, 8, 30, 48, secondary, 0.16], [23, 14, 18, 36, gold, 0.11]);
  } else if (background === "horizon") {
    rects.push([0, 38, 64, 26, secondary, 0.16], [0, 48, 64, 16, accent, 0.1]);
  }

  for (let i = 0; i < 7; i += 1) {
    const color = pick([accent, secondary, gold], rng);
    rects.push([
      Math.floor(rng() * 58),
      Math.floor(rng() * 58),
      2 + Math.floor(rng() * (loud ? 8 : 4)),
      2 + Math.floor(rng() * (loud ? 8 : 4)),
      color,
      loud ? 0.45 : 0.18,
    ]);
  }
  rects.push([1, 1, 62, 62, "none"]);
  return rects;
}

function drawAura(model: RenderModel): Rect[] {
  const { palette, aura } = model;
  const [, ink, accent, secondary, gold] = palette;
  if (aura === "spark") {
    return [[8, 9, 3, 3, gold], [11, 12, 3, 3, gold], [51, 18, 3, 3, accent], [48, 21, 3, 3, accent]];
  }
  if (aura === "moon") return [[49, 7, 8, 8, secondary], [46, 7, 6, 8, ink, 0.5]];
  if (aura === "glitch") return [[0, 13, 11, 3, accent], [53, 23, 11, 3, secondary], [2, 45, 8, 3, gold]];
  if (aura === "relic") return [[5, 6, 8, 8, gold, 0.75], [7, 8, 4, 4, ink, 0.55], [51, 50, 7, 7, secondary, 0.65]];
  if (aura === "embers") return [[7, 51, 3, 4, accent], [16, 55, 2, 3, gold], [55, 47, 3, 5, accent]];
  return [];
}

function drawAccessory(model: RenderModel): Rect[] {
  const { accessory, palette } = model;
  const [, ink, accent, secondary, gold] = palette;
  if (accessory === "crown") return [[23, 10, 18, 4, gold], [24, 6, 4, 5, gold], [31, 4, 4, 7, gold], [38, 6, 4, 5, gold]];
  if (accessory === "visor") return [[17, 24, 30, 5, ink], [20, 25, 24, 3, secondary]];
  if (accessory === "halo") return [[20, 7, 24, 3, gold], [23, 5, 18, 2, gold, 0.7]];
  if (accessory === "horns") return [[13, 12, 6, 8, gold], [45, 12, 6, 8, gold], [15, 10, 4, 4, gold], [45, 10, 4, 4, gold]];
  if (accessory === "scarf") return [[15, 42, 35, 4, accent], [40, 46, 6, 10, accent]];
  if (accessory === "headband") return [[15, 20, 34, 3, accent], [47, 19, 7, 3, accent]];
  if (accessory === "signal") return [[49, 10, 3, 12, secondary], [53, 7, 3, 15, secondary], [57, 4, 3, 18, secondary]];
  return [];
}

function drawMarking(model: RenderModel): Rect[] {
  const { marking, palette, subject } = model;
  const [bg, ink, accent, secondary, gold] = palette;
  if (marking === "blaze") return [[30, 18, 5, 19, gold, 0.82], [31, 25, 3, 11, bg, 0.22]];
  if (marking === "stripes") return [[18, 30, 28, 3, accent, 0.82], [16, 37, 30, 3, secondary, 0.74], [21, 44, 21, 3, accent, 0.72]];
  if (marking === "spots") return [[18, 23, 5, 5, secondary], [40, 34, 4, 4, gold], [25, 45, 3, 3, accent], [46, 47, 4, 4, secondary]];
  if (marking === "socks") return [[13, 51, 5, 7, gold], [26, 52, 5, 7, gold], [40, 51, 5, 7, gold], [50, 51, 4, 7, gold]];
  if (marking === "chrome") return [[13, 23, 5, 17, secondary, 0.78], [46, 25, 5, 15, secondary, 0.72], [28, 38, 8, 3, secondary, 0.86]];
  if (marking === "warpaint") return [[18, 27, 9, 3, accent], [37, 27, 9, 3, accent], [25, 33, 14, 3, accent]];
  if (marking === "patch" && subject !== "horse") return [[17, 24, 13, 9, ink], [20, 27, 5, 3, bg]];
  return [];
}

function drawPoseLayer(model: RenderModel): Rect[] {
  const { pose, palette, subject } = model;
  const [, , accent, secondary, gold] = palette;
  if (pose === "winged") {
    return subject === "horse" || subject === "dragon"
      ? [[5, 24, 13, 9, secondary], [8, 19, 16, 8, secondary], [47, 24, 12, 8, accent, 0.72]]
      : [[6, 32, 9, 18, secondary, 0.56], [49, 32, 9, 18, secondary, 0.56]];
  }
  if (pose === "charging") return [[4, 39, 12, 5, accent, 0.65], [7, 44, 9, 4, gold, 0.65]];
  if (pose === "relic") return [[4, 52, 56, 4, gold, 0.3], [8, 49, 48, 2, secondary, 0.3]];
  if (pose === "wide") return [[7, 42, 10, 17, secondary, 0.45], [47, 42, 10, 17, accent, 0.45]];
  if (pose === "low") return [[9, 49, 46, 8, secondary, 0.28]];
  return [];
}

function drawBadges(input: ClawPegRenderInput, model: RenderModel): string {
  const rankText = `#${model.rank.toLocaleString("en-US")}`;
  const rarityFill = model.rarity === "Mythic" ? model.palette[4] : model.rarity === "Rare" ? model.palette[3] : model.palette[2];
  return [
    `<rect x='3' y='3' width='18' height='7' fill='${rarityFill}'/>`,
    `<text x='6' y='8' font-family='monospace' font-size='4' font-weight='700' fill='${model.palette[1]}'>#${input.pegId}</text>`,
    "<rect x='3' y='12' width='24' height='7' fill='#050505' opacity='0.86'/>",
    `<text x='6' y='17' font-family='monospace' font-size='4' font-weight='700' fill='${model.palette[1]}'>${rankText}</text>`,
  ].join("");
}

function bigintishToString(value: bigint | number | string) {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function deriveTradeArtSeed(input: ClawPegTradeArtRenderInput): string {
  const source = [
    input.rendererId,
    input.rendererVersion,
    input.collectionSeed,
    input.tokenMint,
    String(input.tradeIndex),
    input.trader,
    input.inputMint,
    input.outputMint,
    bigintishToString(input.amountIn),
    bigintishToString(input.amountOut),
    bigintishToString(input.slot),
    JSON.stringify(input.params || {}),
  ].join(":");
  return hashToUint32(source).toString(16).padStart(8, "0");
}

export function renderClawPegTradeArtSvg(input: ClawPegTradeArtRenderInput): string {
  if (input.rendererVersion === "0.3.0" || input.rendererVersion === "latest") {
    return renderClawPegTradeArtSvgV3(input);
  }
  const seed = input.seed || deriveTradeArtSeed(input);
  const rng = createRng(hashToUint32(seed));
  const params = input.params || {};
  const subject = normalizeSubject(params.subject);
  const paletteName = String(params.palette || "cyber").toLowerCase();
  const palette = NAMED_PALETTES[paletteName] || pick(PALETTES, rng);
  const [bg, ink, accent, secondary, gold] = palette;
  const amountIn = Number(BigInt(bigintishToString(input.amountIn)) % BigInt(10_000));
  const amountOut = Number(BigInt(bigintishToString(input.amountOut)) % BigInt(10_000));
  const bars = Array.from({ length: 12 }, (_, index) => {
    const value = hashToUint32(`${seed}:bar:${index}:${amountIn}:${amountOut}`);
    return 5 + (value % 35);
  });
  const tradeIndex = String(input.tradeIndex);
  const rank = hashToUint32(`${seed}:trade-rank`) % 10_000;
  const rarity = rarityFromRank(rank);
  const rects: Rect[] = [
    [0, 0, 64, 64, bg],
    [0, 42, 64, 22, "#050505", 0.42],
    [4, 4, 56, 56, secondary, 0.08],
  ];

  bars.forEach((height, index) => {
    const x = 6 + index * 4;
    const color = index % 3 === 0 ? accent : index % 3 === 1 ? secondary : gold;
    rects.push([x, 48 - height, 3, height, color, 0.74]);
  });

  rects.push(
    [8, 20, 12 + (amountIn % 18), 4, accent],
    [8, 28, 12 + (amountOut % 18), 4, secondary],
    [34, 18, 13, 13, gold, 0.82],
    [39, 15, 12, 12, secondary, 0.7],
    [45, 12, 8, 8, accent, 0.65],
    [2, 2, 60, 2, accent],
    [2, 60, 60, 2, secondary],
  );

  if (subject === "horse" || subject === "dragon") {
    rects.push([38, 34, 16, 7, gold], [47, 30, 8, 6, gold], [42, 41, 3, 8, gold], [52, 40, 3, 8, gold]);
  } else {
    rects.push([38, 32, 14, 14, ink], [35, 36, 20, 8, ink], [41, 36, 3, 3, accent], [49, 36, 3, 3, secondary]);
  }

  const rarityFill = rarity === "Mythic" ? gold : rarity === "Rare" ? secondary : accent;
  const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' shape-rendering='crispEdges'>",
    renderRects(rects),
    `<rect x='3' y='3' width='23' height='7' fill='${rarityFill}'/>`,
    `<text x='6' y='8' font-family='monospace' font-size='4' font-weight='700' fill='${ink}'>T#${tradeIndex.slice(-4)}</text>`,
    "<rect x='3' y='12' width='24' height='7' fill='#050505' opacity='0.86'/>",
    `<text x='6' y='17' font-family='monospace' font-size='4' font-weight='700' fill='${ink}'>#${rank.toLocaleString("en-US")}</text>`,
    `<text x='32' y='62' text-anchor='middle' font-family='monospace' font-size='4' fill='${ink}'>cPEG trade art</text>`,
    "</svg>",
  ];
  return svg.join("");
}

function drawHat(subject: SubjectKey, palette: string[], rng: () => number): Rect[] {
  const [, , accent, secondary, gold] = palette;
  if (subject === "wizard") {
    return [
      [20, 3, 7, 6, secondary],
      [27, 3, 8, 6, secondary],
      [18, 9, 20, 5, secondary],
      [22, 5, 3, 3, gold],
      [31, 6, 2, 2, gold],
      [14, 14, 30, 4, accent],
    ];
  }
  if (subject === "samurai") {
    return [
      [20, 6, 24, 4, gold],
      [27, 1, 7, 8, accent],
      [17, 10, 30, 4, accent],
    ];
  }
  if (subject === "sports") {
    return [
      [18, 7, 28, 7, accent],
      [38, 11, 13, 3, accent],
      [24, 9, 10, 2, gold],
    ];
  }
  if (subject === "ninja") {
    return [[17, 13, 31, 8, "#0b0b0d"]];
  }
  if (rng() > 0.86) {
    return [[19, 7, 25, 5, accent], [37, 10, 10, 3, accent]];
  }
  return [];
}

function drawPortrait(subject: SubjectKey, palette: string[], rng: () => number, style: string, vibe: string): Rect[] {
  const [bg, ink, accent, secondary, gold] = palette;
  const dark = subject === "ninja" ? "#111113" : subject === "ghost" ? ink : "#2b2e31";
  const mid = subject === "monkey" || subject === "ape" || subject === "bear" ? "#8b5a35" : subject === "frog" ? "#4bb35f" : subject === "robot" ? "#5d646b" : subject === "alien" ? "#8de85e" : dark;
  const light = subject === "ghost" ? "#f4fbff" : subject === "robot" ? "#9aa3aa" : subject === "dragon" ? "#315c36" : "#3a3d40";
  const eye = subject === "alien" ? "#111111" : vibe === "dark" ? "#ff5a2f" : accent;
  const rects: Rect[] = [];

  if (["cat", "dog", "monkey", "ape", "bear", "frog"].includes(subject)) {
    rects.push([10, 18, 10, 10, mid], [44, 18, 10, 10, mid]);
  }
  if (subject === "cat") rects.push([14, 12, 7, 8, mid], [43, 12, 7, 8, mid]);
  if (subject === "dragon") rects.push([15, 10, 6, 10, gold], [43, 10, 6, 10, gold], [8, 34, 8, 18, accent, 0.75], [48, 34, 8, 18, accent, 0.75]);
  if (subject === "alien" || subject === "agent") rects.push([29, 8, 3, 8, secondary], [35, 8, 3, 8, secondary]);

  rects.push(...drawHat(subject, palette, rng));
  rects.push(
    [16, 18, 32, 23, mid],
    [13, 23, 38, 15, mid],
    [18, 40, 28, 10, dark],
    [11, 50, 42, 12, dark],
  );

  if (subject === "robot") {
    rects.push([16, 17, 32, 25, "#6d747a"], [20, 21, 24, 4, "#272b2f"], [22, 29, 6, 5, eye], [36, 29, 6, 5, eye], [27, 39, 10, 2, "#181a1d"], [14, 26, 3, 9, secondary], [47, 26, 3, 9, secondary]);
  } else if (subject === "ghost") {
    rects.push([18, 17, 28, 28, "#eef7ff"], [15, 28, 34, 21, "#eef7ff"], [15, 49, 7, 7, "#eef7ff"], [29, 49, 7, 7, "#eef7ff"], [43, 49, 7, 7, "#eef7ff"], [23, 28, 5, 7, bg], [37, 28, 5, 7, bg], [29, 40, 7, 3, bg]);
  } else {
    rects.push([20, 26, 8, 5, eye], [36, 26, 8, 5, eye], [19, 24, 10, 2, "#111111", 0.75], [35, 24, 10, 2, "#111111", 0.75]);
    if (["monkey", "ape", "dog", "bear", "dragon"].includes(subject)) {
      rects.push([25, 33, 14, 9, gold], [29, 35, 6, 3, "#111111", 0.75]);
    } else if (subject === "frog") {
      rects.push([22, 35, 20, 3, "#102a16"], [25, 39, 14, 2, accent]);
    } else {
      rects.push([27, 38, 10, 2, accent]);
    }
  }

  if (subject === "bird") rects.push([38, 31, 12, 5, gold], [43, 36, 5, 3, gold]);
  if (subject === "meme") rects.push([11, 12, 8, 8, gold], [47, 12, 5, 5, accent], [8, 45, 8, 4, secondary]);
  if (style === "badge") rects.push([5, 5, 54, 4, accent, 0.8], [5, 55, 54, 4, secondary, 0.8]);

  return rects;
}

function drawHorse(palette: string[], rng: () => number, vibe: string): Rect[] {
  const [bg, ink, accent, secondary, gold] = palette;
  const coat = pick(["#8d5535", "#9b5d3c", "#5a392e", "#d5eaf2", gold], rng);
  const mane = pick([ink, "#3b241d", accent], rng);
  const rects: Rect[] = [
    [9, 35, 24, 12, coat],
    [15, 29, 22, 10, coat],
    [34, 22, 10, 22, coat],
    [40, 16, 13, 11, coat],
    [49, 19, 6, 8, coat],
    [38, 13, 11, 5, mane],
    [35, 19, 4, 21, mane],
    [13, 47, 5, 10, coat],
    [26, 47, 5, 12, coat],
    [39, 44, 5, 13, coat],
    [50, 44, 4, 12, coat],
    [18, 57, 5, 3, mane],
    [31, 58, 5, 3, mane],
    [44, 57, 5, 3, mane],
    [54, 56, 5, 3, mane],
    [49, 18, 4, 3, ink],
    [54, 14, 6, 3, mane],
    [7, 30, 5, 14, mane],
  ];
  if (vibe === "loud") rects.push([10, 33, 18, 3, secondary], [35, 26, 5, 5, accent]);
  rects.push([0, 59, 64, 5, bg, 0.55]);
  return rects;
}

function drawDragon(palette: string[], rng: () => number): Rect[] {
  const [, ink, accent, secondary, gold] = palette;
  const scale = pick(["#315c36", "#61408c", "#8c3030", "#2f6570"], rng);
  return [
    [12, 35, 28, 11, scale],
    [30, 27, 18, 11, scale],
    [43, 20, 13, 10, scale],
    [50, 16, 5, 5, gold],
    [43, 16, 4, 5, gold],
    [47, 23, 5, 3, accent],
    [13, 28, 8, 8, secondary, 0.75],
    [6, 25, 14, 18, secondary, 0.55],
    [37, 38, 5, 15, scale],
    [20, 43, 5, 12, scale],
    [45, 27, 3, 3, ink],
    [54, 29, 7, 3, accent],
    [10, 46, 12, 4, scale],
  ];
}

function renderLegacySvg(input: ClawPegRenderInput): string {
  const seed = input.seed || deriveClawPegSeed(input);
  const rng = createRng(hashToUint32(seed));
  const palette = pick(PALETTES, rng);
  const bg = palette[0];
  const ink = palette[1];
  const accent = palette[2];
  const secondary = palette[3];
  const gold = palette[4];
  const eye = rng() > 0.82 ? gold : secondary;
  const head = 5 + Math.floor(rng() * 4);
  const jaw = 9 + Math.floor(rng() * 3);
  const antenna = rng() > 0.6;
  const halo = rng() > 0.9;
  const clawMark = rng() > 0.72;

  return [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' shape-rendering='crispEdges'>",
    `<rect width='24' height='24' fill='${bg}'/>`,
    `<rect x='2' y='2' width='20' height='20' fill='none' stroke='${accent}' stroke-width='1'/>`,
    halo ? `<rect x='7' y='2' width='10' height='1' fill='${gold}'/>` : "",
    antenna ? `<rect x='11' y='2' width='1' height='3' fill='${secondary}'/><rect x='13' y='2' width='1' height='3' fill='${secondary}'/>` : "",
    `<rect x='${head}' y='6' width='${24 - head * 2}' height='5' fill='${ink}'/>`,
    `<rect x='${jaw}' y='11' width='${24 - jaw * 2}' height='4' fill='${ink}'/>`,
    `<rect x='7' y='8' width='3' height='2' fill='${eye}'/>`,
    `<rect x='14' y='8' width='3' height='2' fill='${eye}'/>`,
    `<rect x='10' y='13' width='4' height='1' fill='${accent}'/>`,
    `<rect x='4' y='15' width='4' height='2' fill='${secondary}'/>`,
    `<rect x='16' y='15' width='4' height='2' fill='${secondary}'/>`,
    `<rect x='6' y='17' width='3' height='3' fill='${accent}'/>`,
    `<rect x='15' y='17' width='3' height='3' fill='${accent}'/>`,
    clawMark ? `<rect x='3' y='5' width='1' height='5' fill='${gold}'/><rect x='5' y='4' width='1' height='6' fill='${gold}'/><rect x='7' y='5' width='1' height='5' fill='${gold}'/>` : "",
    `<text x='12' y='23' text-anchor='middle' font-family='monospace' font-size='2' fill='${ink}'>cPEG #${input.pegId}</text>`,
    "</svg>",
  ].join("");
}

export function renderClawPegSvg(input: ClawPegRenderInput): string {
  if (input.rendererVersion === "0.1.0") {
    return renderLegacySvg(input);
  }
  if (input.rendererVersion === "0.3.0" || input.rendererVersion === "latest") {
    return renderClawPegSvgV3(input);
  }

  const model = buildRenderModel(input);
  const { subject, palette, rng, style, vibe } = model;
  const rects = createScene(model);
  rects.push(...drawAura(model), ...drawPoseLayer(model));

  if (subject === "horse") {
    rects.push(...drawHorse(palette, rng, vibe));
  } else if (subject === "dragon") {
    rects.push(...drawDragon(palette, rng));
  } else {
    rects.push(...drawPortrait(subject, palette, rng, style, vibe));
  }

  rects.push(...drawMarking(model), ...drawAccessory(model));
  if (style === "emblem") rects.push([5, 5, 54, 54, "none"], [7, 7, 50, 3, palette[4], 0.72], [7, 54, 50, 3, palette[4], 0.72]);
  rects.push([2, 2, 60, 2, palette[2]], [2, 60, 60, 2, palette[3]]);

  return [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' shape-rendering='crispEdges'>",
    renderRects(rects),
    drawBadges(input, model),
    `<text x='32' y='62' text-anchor='middle' font-family='monospace' font-size='4' fill='${palette[1]}'>${SUBJECT_LABELS[subject]} #${input.pegId}</text>`,
    "</svg>",
  ].join("");
}

export function getClawPegTraits(input: ClawPegRenderInput) {
  if (input.rendererVersion === "0.3.0" || input.rendererVersion === "latest") {
    return getClawPegTraitsV3(input);
  }
  const model = buildRenderModel(input);
  return {
    seed: model.seed,
    rarity: model.rarity,
    rank: model.rank,
    subject: model.subject,
    style: model.style,
    palette: model.paletteName,
    background: model.background,
    pose: model.pose,
    accessory: model.accessory,
    marking: model.marking,
    aura: model.aura,
    renderer: `${input.rendererId}@${input.rendererVersion}`,
    image_model: "deterministic-svg",
    canonical_source: "renderer-rule",
  };
}
