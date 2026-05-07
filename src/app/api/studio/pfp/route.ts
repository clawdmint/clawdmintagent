import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";

const GenerateStudioPfpSchema = z.object({
 name: z.string().min(1).max(64),
 description: z.string().max(280).optional(),
 soul_archetype: z.string().max(64).optional(),
 tone: z.string().max(32).optional(),
 backstory: z.string().max(1200).optional(),
});

function hashSeed(input: string) {
 return createHash("sha256").update(input).digest("hex");
}

function pickPalette(seed: string) {
 const palettes = [
 ["#08121f", "#0ea5e9", "#67e8f9", "#f5f3ff"],
 ["#140b1f", "#c084fc", "#f0abfc", "#fde68a"],
 ["#111827", "#22c55e", "#86efac", "#ecfccb"],
 ["#1f1308", "#f97316", "#fdba74", "#ffedd5"],
 ] as const;
 const index = parseInt(seed.slice(0, 2), 16) % palettes.length;
 return palettes[index];
}

function buildPromptSummary(input: z.infer<typeof GenerateStudioPfpSchema>) {
 const archetype = input.soul_archetype || "Operator Artist";
 const tone = input.tone || "Precise";
 return `${archetype} sigil portrait with a ${tone.toLowerCase()} studio aura, built for a Clawdmint OpenClaw operator.`;
}

function buildSvg(input: z.infer<typeof GenerateStudioPfpSchema>) {
 const seed = hashSeed([input.name, input.soul_archetype, input.tone, input.backstory].filter(Boolean).join("|"));
 const [bg, primary, accent, light] = pickPalette(seed);
 const ring = 96 + (parseInt(seed.slice(2, 4), 16) % 28);
 const core = 48 + (parseInt(seed.slice(4, 6), 16) % 16);
 const mark = parseInt(seed.slice(6, 8), 16) % 3;
 const summary = buildPromptSummary(input);

 const innerMark = mark === 0
 ? `<path d="M256 176l44 80-44 80-44-80 44-80Z" fill="${accent}" opacity="0.92"/>`
 : mark === 1
 ? `<circle cx="256" cy="256" r="42" fill="${accent}" opacity="0.92"/><path d="M256 196l24 60-24 60-24-60 24-60Z" fill="${light}" opacity="0.88"/>`
 : `<path d="M256 186l58 58-58 82-58-82 58-58Z" fill="${accent}" opacity="0.9"/><path d="M256 212l24 36-24 52-24-52 24-36Z" fill="${light}" opacity="0.86"/>`;

 return `
 <svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${input.name} generated portrait">
 <defs>
 <linearGradient id="bg" x1="64" y1="32" x2="448" y2="480" gradientUnits="userSpaceOnUse">
 <stop stop-color="${bg}"/>
 <stop offset="1" stop-color="#030712"/>
 </linearGradient>
 <radialGradient id="pulse" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(256 256) rotate(90) scale(220)">
 <stop stop-color="${primary}" stop-opacity="0.26"/>
 <stop offset="1" stop-color="${primary}" stop-opacity="0"/>
 </radialGradient>
 <filter id="blur" x="-40%" y="-40%" width="180%" height="180%">
 <feGaussianBlur stdDeviation="18"/>
 </filter>
 </defs>
 <rect width="512" height="512" rx="96" fill="url(#bg)"/>
 <rect x="28" y="28" width="456" height="456" rx="72" stroke="${primary}" stroke-opacity="0.18"/>
 <circle cx="256" cy="256" r="${ring + 24}" fill="url(#pulse)" filter="url(#blur)"/>
 <circle cx="256" cy="256" r="${ring}" stroke="${primary}" stroke-opacity="0.32" stroke-width="2"/>
 <circle cx="256" cy="256" r="${ring - 24}" stroke="${accent}" stroke-opacity="0.22" stroke-width="1.5" stroke-dasharray="8 10"/>
 <circle cx="256" cy="256" r="${core}" fill="#050816" stroke="${primary}" stroke-opacity="0.48"/>
 ${innerMark}
 <path d="M126 392C170 356 213 338 256 338C299 338 342 356 386 392" stroke="${light}" stroke-opacity="0.45" stroke-width="4" stroke-linecap="round"/>
 <text x="256" y="430" text-anchor="middle" fill="${light}" fill-opacity="0.92" font-size="18" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" letter-spacing="4">${(input.name || "AGENT").slice(0, 16).toUpperCase()}</text>
 <text x="256" y="456" text-anchor="middle" fill="${primary}" fill-opacity="0.78" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" letter-spacing="2">${summary.slice(0, 56).toUpperCase()}</text>
 </svg>`;
}

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const parsed = GenerateStudioPfpSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ success: false, error: "Invalid PFP request", details: parsed.error.flatten() }, { status: 400 });
 }

 const promptSummary = buildPromptSummary(parsed.data);
 const svg = buildSvg(parsed.data).trim();
 const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

 return NextResponse.json({
 success: true,
 pfp: {
 svg,
 data_url: dataUrl,
 prompt_summary: promptSummary,
 },
 });
 } catch (error) {
 console.error("Generate studio PFP error:", error);
 return NextResponse.json({ success: false, error: "Failed to generate PFP" }, { status: 500 });
 }
}
