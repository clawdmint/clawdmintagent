"use client";

import { Coins, Lock, Sparkles, ShoppingBag } from "lucide-react";

const captureParticles = Array.from({ length: 10 }, (_, i) => i);
const releaseParticles = Array.from({ length: 7 }, (_, i) => i);
const orbitParticles = Array.from({ length: 8 }, (_, i) => i);

type Tone = "ivory" | "blue" | "magenta" | "amber";

interface FlowNode {
  index: string;
  label: string;
  caption: string;
  icon: typeof Coins;
  tone: Tone;
}

const nodes: FlowNode[] = [
  {
    index: "01",
    label: "Token",
    caption: "Hold the agent token.",
    icon: Coins,
    tone: "ivory",
  },
  {
    index: "02",
    label: "Escrow",
    caption: "Lock backing via MPL Hybrid.",
    icon: Lock,
    tone: "blue",
  },
  {
    index: "03",
    label: "cPEG",
    caption: "Receive a Core identity.",
    icon: Sparkles,
    tone: "magenta",
  },
  {
    index: "04",
    label: "Trade",
    caption: "Sell or release back.",
    icon: ShoppingBag,
    tone: "amber",
  },
];

const toneTokens: Record<
  Tone,
  {
    text: string;
    ring: string;
    glow: string;
    fill: string;
    halo: string;
    accent: string;
    bgRgb: string;
  }
> = {
  ivory: {
    text: "text-[#f7f2df]",
    ring: "border-[#f7f2df]/60",
    glow: "shadow-[0_0_46px_-8px_rgba(247,242,223,0.55)]",
    fill: "bg-[#f7f2df]/10",
    halo: "from-[#f7f2df]/30 to-transparent",
    accent: "#f7f2df",
    bgRgb: "247,242,223",
  },
  blue: {
    text: "text-[#53c7ff]",
    ring: "border-[#53c7ff]/65",
    glow: "shadow-[0_0_46px_-8px_rgba(83,199,255,0.75)]",
    fill: "bg-[#53c7ff]/12",
    halo: "from-[#53c7ff]/40 to-transparent",
    accent: "#53c7ff",
    bgRgb: "83,199,255",
  },
  magenta: {
    text: "text-[#ec5cff]",
    ring: "border-[#ec5cff]/60",
    glow: "shadow-[0_0_50px_-8px_rgba(236,92,255,0.75)]",
    fill: "bg-[#ec5cff]/12",
    halo: "from-[#ec5cff]/40 to-transparent",
    accent: "#ec5cff",
    bgRgb: "236,92,255",
  },
  amber: {
    text: "text-[#f7c948]",
    ring: "border-[#f7c948]/65",
    glow: "shadow-[0_0_46px_-8px_rgba(247,201,72,0.65)]",
    fill: "bg-[#f7c948]/12",
    halo: "from-[#f7c948]/35 to-transparent",
    accent: "#f7c948",
    bgRgb: "247,201,72",
  },
};

interface PipelineNodeProps {
  node: FlowNode;
  delay: number;
}

function PipelineNode({ node, delay }: PipelineNodeProps) {
  const tone = toneTokens[node.tone];
  const Icon = node.icon;
  return (
    <div className="relative z-10 flex flex-col items-center text-center">
      <div className="relative">
        <span
          aria-hidden
          className="cpeg-ring-1 pointer-events-none absolute inset-0 -m-3 rounded-full border"
          style={{
            borderColor: `rgba(${tone.bgRgb}, 0.35)`,
            animationDelay: `${delay * 0.4}s`,
          }}
        />
        <span
          aria-hidden
          className="cpeg-ring-2 pointer-events-none absolute inset-0 -m-6 rounded-full border"
          style={{
            borderColor: `rgba(${tone.bgRgb}, 0.18)`,
            animationDelay: `${delay * 0.4 + 0.6}s`,
          }}
        />
        <div
          className={`relative grid h-24 w-24 place-items-center border-2 bg-neutral-50 transition duration-300 dark:bg-[#0a0a0a] md:h-28 md:w-28 ${tone.ring} ${tone.glow} cpeg-node-float hover:-translate-y-1`}
          style={{ animationDelay: `${delay * 0.25}s` }}
        >
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-0 ${tone.fill}`}
          />
          <span
            aria-hidden
            className={`pointer-events-none absolute -inset-px bg-gradient-radial ${tone.halo} opacity-40 mix-blend-screen`}
          />
          <Icon className={`relative h-10 w-10 ${tone.text}`} />
          <span
            aria-hidden
            className="absolute -top-1.5 -right-1.5 inline-flex h-3 w-3 items-center justify-center"
          >
            <span
              className="cpeg-pulse-dot absolute inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: `rgba(${tone.bgRgb}, 0.45)` }}
            />
            <span
              className="relative inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: tone.accent }}
            />
          </span>
        </div>
      </div>

      <div className="mt-5">
        <p className={`font-mono text-[10px] uppercase tracking-[0.28em] ${tone.text}`}>
          <span className="opacity-70">{node.index}</span>{" "}
          <span className="font-black">{node.label}</span>
        </p>
        <p className="mt-2 max-w-[170px] text-[12px] leading-5 text-neutral-600 dark:text-white/55">
          {node.caption}
        </p>
      </div>
    </div>
  );
}

export function CpegFlowAnimation() {
  return (
    <div className="relative w-full overflow-hidden border border-neutral-200 bg-neutral-100/90 px-6 py-14 dark:border-white/10 dark:bg-[#0a0a0a] md:px-10 md:py-20">
      <style>{`
        @keyframes cpegFlowLtr {
          0% { transform: translateX(-10%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(110%); opacity: 0; }
        }
        @keyframes cpegFlowRtl {
          0% { transform: translateX(110%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(-10%); opacity: 0; }
        }
        @keyframes cpegOrbit {
          0% { transform: rotate(0deg) translateX(46px) rotate(0deg); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: rotate(360deg) translateX(46px) rotate(-360deg); opacity: 0; }
        }
        @keyframes cpegRingPulse {
          0%, 100% { transform: scale(0.95); opacity: 0.35; }
          50% { transform: scale(1.15); opacity: 0.85; }
        }
        @keyframes cpegRingPulseSm {
          0%, 100% { transform: scale(0.92); opacity: 0.55; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes cpegNodeFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes cpegDotPulse {
          0%, 100% { transform: scale(0.9); opacity: 0.45; }
          50% { transform: scale(2.1); opacity: 0; }
        }
        @keyframes cpegLineShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes cpegSpin {
          to { transform: rotate(360deg); }
        }
        .cpeg-particle-ltr { animation: cpegFlowLtr 5.5s linear infinite; }
        .cpeg-particle-rtl { animation: cpegFlowRtl 6.5s linear infinite; }
        .cpeg-orbit-particle { animation: cpegOrbit 8s linear infinite; }
        .cpeg-ring-1 { animation: cpegRingPulseSm 3s ease-in-out infinite; }
        .cpeg-ring-2 { animation: cpegRingPulse 4.5s ease-in-out infinite; }
        .cpeg-node-float { animation: cpegNodeFloat 5s ease-in-out infinite; }
        .cpeg-pulse-dot { animation: cpegDotPulse 2.2s ease-out infinite; }
        .cpeg-line-shimmer {
          background-image: linear-gradient(90deg,
            transparent 0%,
            rgba(83,199,255,0) 30%,
            rgba(83,199,255,0.95) 50%,
            rgba(236,92,255,0) 70%,
            transparent 100%);
          background-size: 200% 100%;
          animation: cpegLineShimmer 4.5s linear infinite;
        }
        .cpeg-spin-slow { animation: cpegSpin 22s linear infinite; }
        .bg-gradient-radial { background-image: radial-gradient(circle at center, var(--tw-gradient-stops)); }
        @media (prefers-reduced-motion: reduce) {
          .cpeg-particle-ltr, .cpeg-particle-rtl, .cpeg-orbit-particle, .cpeg-ring-1, .cpeg-ring-2,
          .cpeg-node-float, .cpeg-pulse-dot, .cpeg-line-shimmer, .cpeg-spin-slow {
            animation: none !important;
          }
        }
      `}</style>

      {/* radial backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          backgroundImage:
            "radial-gradient(circle at 12% 25%, rgba(83,199,255,0.20), transparent 42%), radial-gradient(circle at 88% 75%, rgba(236,92,255,0.16), transparent 42%), radial-gradient(circle at 50% 50%, rgba(247,201,72,0.06), transparent 60%)",
        }}
      />
      {/* grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(circle at 50% 50%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(circle at 50% 50%, black 30%, transparent 75%)",
        }}
      />
      {/* slowly rotating accent ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-1/2 hidden h-[420px] w-[420px] -translate-y-1/2 opacity-30 md:block"
      >
        <div
          className="cpeg-spin-slow h-full w-full rounded-full border border-dashed"
          style={{ borderColor: "rgba(83,199,255,0.35)" }}
        />
      </div>

      <div className="relative grid grid-cols-1 items-stretch gap-10 md:grid-cols-[1.05fr_2.6fr_1fr]">
        {/* Left: explainer */}
        <div className="relative flex flex-col justify-center text-left md:pr-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#53c7ff]">
            cPEG pipeline
          </p>
          <h3 className="mt-3 text-2xl font-black uppercase leading-[1.05] text-neutral-950 dark:text-[#f7f2df] md:text-3xl">
            One round-trip,
            <br />
            <span className="text-[#53c7ff]">four moves.</span>
          </h3>
          <p className="mt-3 text-[13px] leading-6 text-neutral-600 dark:text-white/55">
            Tokens flow into escrow, identities flow back out. Trade them on the market or
            redeem them back to tokens any time.
          </p>

          <div className="mt-5 grid gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
            <div className="flex items-center gap-2 text-neutral-600 dark:text-white/55">
              <span className="cpeg-pulse-dot relative inline-flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-block h-2 w-2 rounded-full bg-[#53c7ff]/60" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[#53c7ff]" />
              </span>
              Capture: token to cPEG
            </div>
            <div className="flex items-center gap-2 text-neutral-600 dark:text-white/55">
              <span className="cpeg-pulse-dot relative inline-flex h-2 w-2 items-center justify-center" style={{ animationDelay: "1.2s" }}>
                <span className="absolute inline-block h-2 w-2 rounded-full bg-[#ec5cff]/60" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[#ec5cff]" />
              </span>
              Release: cPEG to token
            </div>
            <div className="flex items-center gap-2 text-neutral-600 dark:text-white/55">
              <span className="cpeg-pulse-dot relative inline-flex h-2 w-2 items-center justify-center" style={{ animationDelay: "2.1s" }}>
                <span className="absolute inline-block h-2 w-2 rounded-full bg-[#f7c948]/60" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[#f7c948]" />
              </span>
              Trade: cPEG for SOL
            </div>
          </div>
        </div>

        {/* Center: animated pipeline */}
        <div className="relative">
          {/* shimmering connecting line */}
          <div
            aria-hidden
            className="absolute left-[8%] right-[8%] top-[3.25rem] hidden h-[2px] md:block md:top-14"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#53c7ff]/0 via-[#53c7ff]/55 to-[#ec5cff]/0" />
            <div className="cpeg-line-shimmer absolute inset-0 opacity-95" />
          </div>
          {/* second line below, magenta direction */}
          <div
            aria-hidden
            className="absolute left-[8%] right-[8%] top-[3.55rem] hidden h-[2px] md:block md:top-[3.85rem]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#ec5cff]/0 via-[#ec5cff]/30 to-[#53c7ff]/0 blur-[2px]" />
          </div>

          {/* capture particles - LTR */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[8%] right-[8%] top-14 hidden h-1 md:block"
          >
            {captureParticles.map((i) => (
              <span
                key={`ltr-${i}`}
                className="cpeg-particle-ltr absolute top-0 h-1 w-1.5 rounded-full bg-[#53c7ff] shadow-[0_0_10px_3px_rgba(83,199,255,0.85)]"
                style={{ animationDelay: `${i * 0.55}s` }}
              />
            ))}
          </div>

          {/* release particles - RTL */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[8%] right-[8%] top-[3.85rem] hidden h-1 md:block"
          >
            {releaseParticles.map((i) => (
              <span
                key={`rtl-${i}`}
                className="cpeg-particle-rtl absolute top-0 h-[3px] w-[3px] rounded-full bg-[#ec5cff] shadow-[0_0_8px_2px_rgba(236,92,255,0.75)]"
                style={{ animationDelay: `${i * 0.9 + 0.4}s` }}
              />
            ))}
          </div>

          {/* nodes */}
          <div className="relative grid grid-cols-2 items-start gap-y-12 gap-x-6 md:grid-cols-4 md:gap-x-2">
            {nodes.map((node, i) => (
              <PipelineNode key={node.label} node={node} delay={i} />
            ))}
          </div>

          {/* orbit beads around the cPEG node (3rd) - hidden on mobile, visible md+ */}
          <div
            aria-hidden
            className="pointer-events-none absolute hidden md:block"
            style={{ left: "calc(50% + 12%)", top: "0.5rem", width: 0, height: 0 }}
          >
            <div className="relative">
              {orbitParticles.map((i) => (
                <span
                  key={`orbit-${i}`}
                  className="cpeg-orbit-particle absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full bg-[#ec5cff] shadow-[0_0_8px_2px_rgba(236,92,255,0.75)]"
                  style={{ animationDelay: `${i * 1}s` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: live result card */}
        <div className="relative flex flex-col justify-center md:pl-2">
          <div className="relative border border-neutral-200 bg-white p-5 dark:border-white/10 dark:bg-[#0c0c0c]">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 80% 0%, rgba(83,199,255,0.10), transparent 50%)",
              }}
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#53c7ff]">
                  Net result
                </p>
                <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">
                  <span className="cpeg-pulse-dot relative inline-flex h-2 w-2 items-center justify-center">
                    <span className="absolute inline-block h-2 w-2 rounded-full bg-emerald-400/60" />
                    <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-700 dark:text-white/70">
                The token <span className="font-black text-neutral-950 dark:text-[#f7f2df]">is</span> the
                PEG. Capture is reversible. Identities are on-chain art.
              </p>
              <div className="mt-4 flex items-center gap-2 border-t border-neutral-200 pt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:border-white/10 dark:text-white/40">
                <span>Built on</span>
                <span className="text-neutral-900 dark:text-[#f7f2df]">Metaplex</span>
                <span className="opacity-50">/</span>
                <span className="text-neutral-900 dark:text-[#f7f2df]">Solana</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
