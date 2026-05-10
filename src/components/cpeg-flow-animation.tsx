"use client";

import { Coins, Lock, Sparkles, ShoppingBag } from "lucide-react";

const captureParticles = Array.from({ length: 6 }, (_, i) => i);
const releaseParticles = Array.from({ length: 4 }, (_, i) => i);

interface NodeProps {
  icon: typeof Coins;
  label: string;
  caption: string;
  tone: "blue" | "magenta" | "amber" | "ivory";
}

const toneStyles: Record<NodeProps["tone"], { ring: string; glow: string; text: string }> = {
  blue: {
    ring: "border-[#53c7ff]/60",
    glow: "shadow-[0_0_28px_-8px_rgba(83,199,255,0.55)]",
    text: "text-[#53c7ff]",
  },
  magenta: {
    ring: "border-[#ec5cff]/55",
    glow: "shadow-[0_0_28px_-8px_rgba(236,92,255,0.55)]",
    text: "text-[#ec5cff]",
  },
  amber: {
    ring: "border-[#f7c948]/55",
    glow: "shadow-[0_0_28px_-8px_rgba(247,201,72,0.55)]",
    text: "text-[#f7c948]",
  },
  ivory: {
    ring: "border-[#f7f2df]/60",
    glow: "shadow-[0_0_28px_-8px_rgba(247,242,223,0.4)]",
    text: "text-[#f7f2df]",
  },
};

function FlowNode({ icon: Icon, label, caption, tone }: NodeProps) {
  const styles = toneStyles[tone];
  return (
    <div className="relative z-10 flex flex-col items-center text-center">
      <div
        className={`group relative grid h-20 w-20 place-items-center border-2 bg-neutral-50 transition duration-300 dark:bg-[#0c0c0c] md:h-24 md:w-24 ${styles.ring} ${styles.glow} hover:-translate-y-1`}
      >
        <Icon className={`h-8 w-8 ${styles.text}`} />
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 border-2 ${styles.ring} opacity-0 transition group-hover:opacity-60`}
        />
      </div>
      <div className="mt-3">
        <p className={`font-mono text-[10px] uppercase tracking-[0.22em] ${styles.text}`}>{label}</p>
        <p className="mt-1 max-w-[140px] text-[11px] leading-5 text-neutral-600 dark:text-white/55">
          {caption}
        </p>
      </div>
    </div>
  );
}

export function CpegFlowAnimation() {
  return (
    <div className="relative w-full overflow-hidden border border-neutral-200 bg-neutral-100/80 px-6 py-12 dark:border-white/10 dark:bg-[#0a0a0a] md:px-12 md:py-16">
      <style>{`
        @keyframes cpegFlowLtr {
          0% { transform: translateX(-10%); opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { transform: translateX(110%); opacity: 0; }
        }
        @keyframes cpegFlowRtl {
          0% { transform: translateX(110%); opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { transform: translateX(-10%); opacity: 0; }
        }
        @keyframes cpegPulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        .cpeg-particle-ltr { animation: cpegFlowLtr 6s linear infinite; }
        .cpeg-particle-rtl { animation: cpegFlowRtl 7s linear infinite; }
        .cpeg-pulse { animation: cpegPulse 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cpeg-particle-ltr, .cpeg-particle-rtl, .cpeg-pulse { animation: none !important; }
        }
      `}</style>

      {/* radial backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(83,199,255,0.18), transparent 45%), radial-gradient(circle at 80% 70%, rgba(236,92,255,0.13), transparent 45%)",
        }}
      />

      <div className="relative grid grid-cols-1 items-center gap-12 md:grid-cols-[1fr_2.4fr_1fr]">
        {/* Left: explainer */}
        <div className="text-left md:pr-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#53c7ff]">
            cPEG pipeline
          </p>
          <h3 className="mt-3 text-2xl font-black uppercase leading-[1.05] text-neutral-950 dark:text-[#f7f2df] md:text-3xl">
            One round-trip,<br /> four moves.
          </h3>
          <p className="mt-3 text-[13px] leading-6 text-neutral-600 dark:text-white/55">
            Tokens flow into escrow, identities flow back out. Trade them on the market or
            redeem them back to tokens any time.
          </p>
        </div>

        {/* Center: animated pipeline */}
        <div className="relative">
          {/* connecting line */}
          <div
            aria-hidden
            className="absolute left-[8%] right-[8%] top-[2.5rem] hidden h-px bg-gradient-to-r from-[#53c7ff]/0 via-[#53c7ff]/55 to-[#ec5cff]/0 md:top-12 md:block"
          />
          <div
            aria-hidden
            className="absolute left-[8%] right-[8%] top-[2.6rem] hidden h-px bg-gradient-to-r from-[#ec5cff]/0 via-[#ec5cff]/35 to-[#53c7ff]/0 blur-[3px] md:top-[3.05rem] md:block"
          />

          {/* particles - capture direction (LTR) */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[8%] right-[8%] top-12 hidden h-1 md:block"
          >
            {captureParticles.map((i) => (
              <span
                key={`ltr-${i}`}
                className="cpeg-particle-ltr absolute top-0 h-1 w-1 rounded-full bg-[#53c7ff] shadow-[0_0_8px_2px_rgba(83,199,255,0.7)]"
                style={{ animationDelay: `${i * 1}s` }}
              />
            ))}
          </div>

          {/* particles - release direction (RTL) */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[8%] right-[8%] top-[3.05rem] hidden h-1 md:block"
          >
            {releaseParticles.map((i) => (
              <span
                key={`rtl-${i}`}
                className="cpeg-particle-rtl absolute top-0 h-[3px] w-[3px] rounded-full bg-[#ec5cff] shadow-[0_0_7px_2px_rgba(236,92,255,0.6)]"
                style={{ animationDelay: `${i * 1.7 + 0.6}s` }}
              />
            ))}
          </div>

          <div className="relative grid grid-cols-2 items-start gap-8 md:grid-cols-4">
            <FlowNode
              icon={Coins}
              label="01 Token"
              caption="Hold the agent token on Solana."
              tone="ivory"
            />
            <FlowNode
              icon={Lock}
              label="02 Escrow"
              caption="Backing tokens lock in MPL Hybrid."
              tone="blue"
            />
            <FlowNode
              icon={Sparkles}
              label="03 cPEG"
              caption="Receive a Core identity asset."
              tone="magenta"
            />
            <FlowNode
              icon={ShoppingBag}
              label="04 Trade"
              caption="Sell on market or release back."
              tone="amber"
            />
          </div>

          {/* direction legend */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
            <span className="inline-flex items-center gap-2">
              <span className="cpeg-pulse inline-block h-2 w-2 rounded-full bg-[#53c7ff] shadow-[0_0_6px_1px_rgba(83,199,255,0.6)]" />
              Capture: token → cPEG
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="cpeg-pulse inline-block h-2 w-2 rounded-full bg-[#ec5cff] shadow-[0_0_6px_1px_rgba(236,92,255,0.6)]"
                style={{ animationDelay: "1.2s" }}
              />
              Release: cPEG → token
            </span>
          </div>
        </div>

        {/* Right: outcome card */}
        <div className="md:pl-2">
          <div className="border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-[#0c0c0c]">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#53c7ff]">
              Net result
            </p>
            <p className="mt-3 text-sm leading-6 text-neutral-700 dark:text-white/70">
              The token <span className="font-black text-neutral-950 dark:text-[#f7f2df]">is</span> the
              PEG. Capture is reversible. Identities are on-chain art.
            </p>
            <div className="mt-4 flex items-center gap-2 border-t border-neutral-200 pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:border-white/10 dark:text-white/40">
              <span>Built on</span>
              <span className="text-neutral-900 dark:text-[#f7f2df]">Metaplex</span>
              <span className="opacity-50">·</span>
              <span className="text-neutral-900 dark:text-[#f7f2df]">Solana</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
