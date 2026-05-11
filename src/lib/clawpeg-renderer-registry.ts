import { createHash } from "crypto";
import {
  CLAWPEG_DEFAULT_RENDERER_ID,
  CLAWPEG_DEFAULT_RENDERER_VERSION,
} from "@/lib/clawpeg";

/**
 * cPEG Renderer Registry
 * --------------------------------------------------------------------------
 * The cPEG promise is "no IPFS, the image is a rule." That rule is captured
 * by a `rendererHash` written on-chain at launch time. The registry provides:
 *
 *   - Canonical built-in renderer entries (id + version + parameter schema)
 *   - Deterministic hash recomputation so any client can verify a launch's
 *     `rendererHash` matches the published manifest
 *   - Lookup helpers used by the studio launchpad UI and by `/api/cpeg/renderers`
 *
 * V1: only built-in renderers are accepted. V2 will allow community renderers
 * registered through a moderated submission flow. Either way, the on-chain
 * 32-byte `rendererHash` remains the single source of truth.
 */

export interface ClawPegRendererSchemaField {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

export interface ClawPegRendererManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  fields: ClawPegRendererSchemaField[];
  defaultParams: Record<string, string>;
  supportedSubjects?: string[];
  isBuiltIn: true;
}

const SUBJECT_OPTIONS = [
  { value: "ape", label: "Ape" },
  { value: "agent", label: "Agent" },
  { value: "alien", label: "Alien" },
  { value: "azuki", label: "Azuki (anime)" },
  { value: "bear", label: "Bear" },
  { value: "bird", label: "Bird" },
  { value: "cat", label: "Cat" },
  { value: "demon", label: "Demon" },
  { value: "dog", label: "Dog" },
  { value: "dragon", label: "Dragon" },
  { value: "fox", label: "Fox" },
  { value: "frog", label: "Frog" },
  { value: "ghost", label: "Ghost" },
  { value: "horse", label: "Horse" },
  { value: "lion", label: "Lion" },
  { value: "meme", label: "Meme" },
  { value: "monkey", label: "Monkey" },
  { value: "ninja", label: "Ninja" },
  { value: "panda", label: "Panda" },
  { value: "penguin", label: "Penguin" },
  { value: "punk", label: "Punk" },
  { value: "robot", label: "Robot" },
  { value: "samurai", label: "Samurai" },
  { value: "skeleton", label: "Skeleton" },
  { value: "sports", label: "Athlete" },
  { value: "unicorn", label: "Unicorn" },
  { value: "vampire", label: "Vampire" },
  { value: "wizard", label: "Wizard" },
  { value: "wolf", label: "Wolf" },
  { value: "zombie", label: "Zombie" },
];

const PALETTE_OPTIONS = [
  { value: "claw", label: "Claw" },
  { value: "shadow", label: "Shadow" },
  { value: "volcanic", label: "Volcanic" },
  { value: "cyber", label: "Cyber" },
  { value: "candy", label: "Candy" },
  { value: "jungle", label: "Jungle" },
  { value: "frost", label: "Frost" },
  { value: "gold", label: "Gold" },
  { value: "emerald", label: "Emerald" },
  { value: "monochrome", label: "Mono" },
];

/** v0.3.0: accessory and background are sampled per PEG; launch params must stay `auto`. */
const PER_PEG_RANDOM_OPTION = [{ value: "auto", label: "Random per PEG" }];

const VIBE_OPTIONS = [
  { value: "balanced", label: "Balanced" },
  { value: "loud", label: "Loud" },
  { value: "holy", label: "Holy" },
  { value: "dark", label: "Dark" },
];

const STYLE_OPTIONS_LEGACY = [
  { value: "pixel-pfp", label: "Pixel PFP" },
  { value: "badge", label: "Badge" },
  { value: "mascot", label: "Mascot" },
  { value: "emblem", label: "Emblem" },
];

const PALETTE_OPTIONS_LEGACY = [
  { value: "claw", label: "Claw" },
  { value: "jungle", label: "Jungle" },
  { value: "candy", label: "Candy" },
  { value: "cyber", label: "Cyber" },
  { value: "volcanic", label: "Volcanic" },
  { value: "frost", label: "Frost" },
  { value: "gold", label: "Gold" },
  { value: "monochrome", label: "Mono" },
];

const SUBJECT_OPTIONS_LEGACY = [
  { value: "agent", label: "Agent" },
  { value: "monkey", label: "Monkey" },
  { value: "ape", label: "Ape" },
  { value: "horse", label: "Horse" },
  { value: "cat", label: "Cat" },
  { value: "dog", label: "Dog" },
  { value: "robot", label: "Robot" },
  { value: "alien", label: "Alien" },
  { value: "dragon", label: "Dragon" },
  { value: "wizard", label: "Wizard" },
  { value: "samurai", label: "Samurai" },
  { value: "ninja", label: "Ninja" },
  { value: "ghost", label: "Ghost" },
  { value: "frog", label: "Frog" },
  { value: "bear", label: "Bear" },
  { value: "bird", label: "Bird" },
  { value: "sports", label: "Sports" },
  { value: "meme", label: "Meme" },
];

const AGENT_PIXEL_V3: ClawPegRendererManifest = {
  id: CLAWPEG_DEFAULT_RENDERER_ID,
  version: "0.3.0",
  name: "Agent Pixel v3",
  description:
    "Deterministic 24x24 pixel art: 30 archetypes (apes, punks, anime, mythic, wildlife, undead, and more). Per-PEG random accessories and backgrounds.",
  fields: [
    { key: "subject", label: "Subject", options: SUBJECT_OPTIONS },
    { key: "palette", label: "Palette", options: PALETTE_OPTIONS },
    { key: "accessory", label: "Accessory", options: PER_PEG_RANDOM_OPTION },
    { key: "background", label: "Background", options: PER_PEG_RANDOM_OPTION },
    { key: "vibe", label: "Vibe", options: VIBE_OPTIONS },
  ],
  defaultParams: {
    subject: "ape",
    palette: "claw",
    accessory: "auto",
    background: "auto",
    vibe: "balanced",
  },
  supportedSubjects: SUBJECT_OPTIONS.map((option) => option.value),
  isBuiltIn: true,
};

const AGENT_PIXEL_V2_LEGACY: ClawPegRendererManifest = {
  id: CLAWPEG_DEFAULT_RENDERER_ID,
  version: "0.2.0",
  name: "Agent Pixel v2",
  description:
    "Deterministic 24x24 pixel-art renderer covering 18 subjects, 4 styles, 8 palettes, and 4 vibes. Kept for backward compatibility.",
  fields: [
    { key: "subject", label: "Subject", options: SUBJECT_OPTIONS_LEGACY },
    { key: "style", label: "Style", options: STYLE_OPTIONS_LEGACY },
    { key: "palette", label: "Palette", options: PALETTE_OPTIONS_LEGACY },
    { key: "vibe", label: "Vibe", options: VIBE_OPTIONS },
  ],
  defaultParams: {
    subject: "agent",
    style: "pixel-pfp",
    palette: "claw",
    vibe: "balanced",
  },
  supportedSubjects: SUBJECT_OPTIONS_LEGACY.map((option) => option.value),
  isBuiltIn: true,
};

export const CLAWPEG_RENDERER_REGISTRY: ClawPegRendererManifest[] = [
  AGENT_PIXEL_V3,
  AGENT_PIXEL_V2_LEGACY,
];

export function listClawPegRenderers(): ClawPegRendererManifest[] {
  return CLAWPEG_RENDERER_REGISTRY;
}

export function getClawPegRenderer(
  id: string,
  version?: string
): ClawPegRendererManifest | null {
  const matches = CLAWPEG_RENDERER_REGISTRY.filter((entry) => entry.id === id);
  if (!matches.length) return null;
  if (!version) return matches[0];
  return matches.find((entry) => entry.version === version) || null;
}

export function computeClawPegRendererHash(input: {
  id: string;
  version: string;
  params: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({ id: input.id, version: input.version, params: input.params }))
    .digest("hex");
}

export interface ClawPegRendererVerification {
  ok: boolean;
  expectedHash: string;
  manifest: ClawPegRendererManifest | null;
  reason?: string;
}

export function verifyClawPegRendererHash(input: {
  hash: string;
  id: string;
  version: string;
  params: Record<string, unknown>;
}): ClawPegRendererVerification {
  const manifest = getClawPegRenderer(input.id, input.version);
  if (!manifest) {
    return {
      ok: false,
      expectedHash: "",
      manifest: null,
      reason: "Unknown renderer id/version (not in built-in registry)",
    };
  }
  const expectedHash = computeClawPegRendererHash({
    id: input.id,
    version: input.version,
    params: input.params,
  });
  const normalizedSubmitted = input.hash.startsWith("0x") ? input.hash.slice(2) : input.hash;
  const ok = expectedHash.toLowerCase() === normalizedSubmitted.toLowerCase();
  return {
    ok,
    expectedHash,
    manifest,
    reason: ok ? undefined : "Hash does not match the registered renderer manifest",
  };
}

export function buildDefaultClawPegRendererParams(
  manifest: ClawPegRendererManifest
): Record<string, string> {
  return { ...manifest.defaultParams };
}
