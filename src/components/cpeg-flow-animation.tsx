"use client";

import { Coins, Lock, Sparkles, ShoppingBag } from "lucide-react";

const forwardParticles = Array.from({ length: 14 }, (_, i) => i);
const reverseParticles = Array.from({ length: 9 }, (_, i) => i);

type Tone = "ivory" | "blue" | "magenta" | "amber";

interface NodeDef {
  label: string;
  icon: typeof Coins;
  tone: Tone;
}

const nodes: NodeDef[] = [
  { label: "Token", icon: Coins, tone: "ivory" },
  { label: "Escrow", icon: Lock, tone: "blue" },
  { label: "cPEG", icon: Sparkles, tone: "magenta" },
  { label: "Trade", icon: ShoppingBag, tone: "amber" },
];

const toneTokens: Record<
  Tone,
  { hex: string; rgb: string; text: string; ring: string; glow: string; fill: string }
> = {
  ivory: {
    hex: "#f7f2df",
    rgb: "247,242,223",
    text: "text-[#f7f2df]",
    ring: "border-[#f7f2df]/55",
    glow: "shadow-[0_0_50px_-6px_rgba(247,242,223,0.5)]",
    fill: "bg-[#f7f2df]/8",
  },
  blue: {
    hex: "#53c7ff",
    rgb: "83,199,255",
    text: "text-[#53c7ff]",
    ring: "border-[#53c7ff]/70",
    glow: "shadow-[0_0_50px_-6px_rgba(83,199,255,0.75)]",
    fill: "bg-[#53c7ff]/10",
  },
  magenta: {
    hex: "#ec5cff",
    rgb: "236,92,255",
    text: "text-[#ec5cff]",
    ring: "border-[#ec5cff]/65",
    glow: "shadow-[0_0_55px_-6px_rgba(236,92,255,0.8)]",
    fill: "bg-[#ec5cff]/10",
  },
  amber: {
    hex: "#f7c948",
    rgb: "247,201,72",
    text: "text-[#f7c948]",
    ring: "border-[#f7c948]/70",
    glow: "shadow-[0_0_50px_-6px_rgba(247,201,72,0.7)]",
    fill: "bg-[#f7c948]/10",
  },
};

interface PipelineNodeProps {
  node: NodeDef;
  delay: number;
}

function PipelineNode({ node, delay }: PipelineNodeProps) {
  const tone = toneTokens[node.tone];
  const Icon = node.icon;
  return (
    <div className="relative z-20 flex flex-col items-center text-center">
      {/* outer concentric ring */}
      <span
        aria-hidden
        className="cpeg-ring-2 pointer-events-none absolute inset-x-0 top-0 mx-auto h-16 w-16 rounded-full border sm:h-20 sm:w-20 md:h-28 md:w-28"
        style={{
          borderColor: `rgba(${tone.rgb}, 0.18)`,
          animationDelay: `${delay * 0.4 + 0.6}s`,
        }}
      />
      <span
        aria-hidden
        className="cpeg-ring-1 pointer-events-none absolute inset-x-0 top-0 mx-auto h-16 w-16 rounded-full border sm:h-20 sm:w-20 md:h-28 md:w-28"
        style={{
          borderColor: `rgba(${tone.rgb}, 0.35)`,
          animationDelay: `${delay * 0.4}s`,
        }}
      />

      <div
        className={`relative grid h-16 w-16 place-items-center rounded-full border-2 bg-[#0a0a0e] sm:h-20 sm:w-20 md:h-28 md:w-28 ${tone.ring} ${tone.glow} cpeg-node-float`}
        style={{ animationDelay: `${delay * 0.25}s` }}
      >
        <span aria-hidden className={`absolute inset-0 rounded-full ${tone.fill}`} />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 35%, rgba(${tone.rgb}, 0.45), transparent 70%)`,
            mixBlendMode: "screen",
          }}
        />
        <Icon className={`relative h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 ${tone.text}`} strokeWidth={1.75} />

        {/* live dot */}
        <span aria-hidden className="absolute -top-1.5 -right-1.5 inline-flex h-3 w-3 items-center justify-center">
          <span
            className="cpeg-pulse-dot absolute inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: `rgba(${tone.rgb}, 0.45)` }}
          />
          <span
            className="relative inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: tone.hex }}
          />
        </span>
      </div>

      <p className={`mt-4 font-mono text-[11px] font-black uppercase tracking-[0.28em] ${tone.text}`}>
        {node.label}
      </p>
    </div>
  );
}

export function CpegFlowAnimation() {
  return (
    <div className="relative w-full overflow-hidden border border-white/10 bg-[#08080c] py-14 md:py-20">
      <style>{`
        @keyframes cpegFlowLtr {
          0% { transform: translateX(0); opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        @keyframes cpegFlowRtl {
          0% { transform: translateX(100%); opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { transform: translateX(0); opacity: 0; }
        }
        @keyframes cpegRingPulse {
          0%, 100% { transform: scale(0.95); opacity: 0.35; }
          50% { transform: scale(1.18); opacity: 0.85; }
        }
        @keyframes cpegRingPulseSm {
          0%, 100% { transform: scale(0.92); opacity: 0.55; }
          50% { transform: scale(1.1); opacity: 1; }
        }
        @keyframes cpegNodeFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes cpegDotPulse {
          0%, 100% { transform: scale(0.9); opacity: 0.55; }
          50% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes cpegPipeGlow {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.95; }
        }
        @keyframes cpegSpinSlow {
          to { transform: rotate(360deg); }
        }
        .cpeg-particle-ltr { animation: cpegFlowLtr 4.5s linear infinite; }
        .cpeg-particle-rtl { animation: cpegFlowRtl 5.5s linear infinite; }
        .cpeg-ring-1 { animation: cpegRingPulseSm 3s ease-in-out infinite; }
        .cpeg-ring-2 { animation: cpegRingPulse 4.5s ease-in-out infinite; }
        .cpeg-node-float { animation: cpegNodeFloat 5s ease-in-out infinite; }
        .cpeg-pulse-dot { animation: cpegDotPulse 2.2s ease-out infinite; }
        .cpeg-pipe-glow { animation: cpegPipeGlow 3.5s ease-in-out infinite; }
        .cpeg-spin-slow { animation: cpegSpinSlow 28s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cpeg-particle-ltr, .cpeg-particle-rtl, .cpeg-ring-1, .cpeg-ring-2,
          .cpeg-node-float, .cpeg-pulse-dot, .cpeg-pipe-glow, .cpeg-spin-slow {
            animation: none !important;
          }
        }
      `}</style>

      {/* backdrop glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 50%, rgba(83,199,255,0.18), transparent 45%), radial-gradient(circle at 85% 50%, rgba(236,92,255,0.16), transparent 45%), radial-gradient(circle at 50% 100%, rgba(247,201,72,0.06), transparent 60%)",
        }}
      />

      {/* faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      {/* rotating accent ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/2 hidden h-[460px] w-[460px] -translate-y-1/2 opacity-30 md:block"
      >
        <div
          className="cpeg-spin-slow h-full w-full rounded-full border border-dashed"
          style={{ borderColor: "rgba(83,199,255,0.3)" }}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-1/2 hidden h-[460px] w-[460px] -translate-y-1/2 opacity-25 md:block"
      >
        <div
          className="cpeg-spin-slow h-full w-full rounded-full border border-dashed"
          style={{ borderColor: "rgba(236,92,255,0.3)", animationDirection: "reverse" }}
        />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 md:px-8">
        {/* PIPE + NODES */}
        <div className="relative grid grid-cols-4 items-center gap-1 md:gap-4">
          {/* the pipe (tube) sitting horizontally behind nodes */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-1/2 block h-2 -translate-y-1/2 overflow-hidden rounded-full md:h-3"
          >
            {/* tube body */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 40%, rgba(0,0,0,0.5) 100%)",
                boxShadow: "inset 0 0 14px rgba(0,0,0,0.7)",
              }}
            />
            {/* tube neon inner glow */}
            <div
              className="cpeg-pipe-glow absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, rgba(83,199,255,0.0), rgba(83,199,255,0.85) 30%, rgba(236,92,255,0.85) 70%, rgba(247,201,72,0.0))",
                boxShadow:
                  "0 0 12px rgba(83,199,255,0.7), 0 0 20px rgba(236,92,255,0.4)",
              }}
            />

            {/* forward particles (blue) */}
            {forwardParticles.map((i) => (
              <span
                key={`ltr-${i}`}
                className="cpeg-particle-ltr absolute top-1/2 -translate-y-1/2 h-2 w-3 rounded-full bg-[#53c7ff]"
                style={{
                  animationDelay: `${i * 0.42}s`,
                  boxShadow:
                    "0 0 8px rgba(83,199,255,0.95), 0 0 16px rgba(83,199,255,0.55)",
                }}
              />
            ))}

            {/* reverse particles (magenta) */}
            {reverseParticles.map((i) => (
              <span
                key={`rtl-${i}`}
                className="cpeg-particle-rtl absolute top-1/2 -translate-y-1/2 h-[5px] w-2 rounded-full bg-[#ec5cff]"
                style={{
                  animationDelay: `${i * 0.6 + 0.3}s`,
                  boxShadow:
                    "0 0 8px rgba(236,92,255,0.95), 0 0 14px rgba(236,92,255,0.55)",
                }}
              />
            ))}
          </div>

          {/* nodes */}
          {nodes.map((node, i) => (
            <PipelineNode key={node.label} node={node} delay={i} />
          ))}
        </div>

        {/* minimal legend */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 font-mono text-[10px] uppercase tracking-[0.28em] text-white/55">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-1 w-6 rounded-full bg-[#53c7ff] shadow-[0_0_8px_2px_rgba(83,199,255,0.6)]" />
            Capture
          </span>
          <span className="inline-flex items-center gap-2 text-white/50">
            <span className="inline-block h-1 w-6 rounded-full bg-[#ec5cff] shadow-[0_0_8px_2px_rgba(236,92,255,0.6)]" />
            Release
          </span>
          <span className="inline-flex items-center gap-2 text-white/40">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f7c948] shadow-[0_0_6px_2px_rgba(247,201,72,0.6)]" />
            Trade on Solana
          </span>
        </div>
      </div>
    </div>
  );
}
