"use client";

import { useCallback, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";

/**
 * Hero "contract address" surface for a cPEG launch.
 *
 * uPEG's product framing centers the token contract address: the asset itself is the
 * ERC-20 / Token-2022, and every aggregator (DEXScreener, Birdeye, Jupiter) keys off
 * that address. Our previous UI treated the mint as metadata buried in the page, which
 * confused buyers who expected a CA-first experience. This component restores parity:
 *
 *   - The mint pubkey is the most prominent monospace block on the collection page.
 *   - One-tap copy puts the address on the clipboard for swap aggregators.
 *   - Direct deep-links open Solana Explorer, Solscan, Birdeye, DEXScreener (Solana),
 *     GeckoTerminal, and Jupiter swap pre-routed against SOL <-> mint.
 *
 * The component intentionally avoids fetching live price/liquidity data here; the
 * panel above it (Token-2022 state) handles supply + holders, and aggregator cards
 * surface the trading data once a pool exists. Keeping this component dumb keeps the
 * hero above the fold even on slow RPC nodes.
 */
interface CpegContractBarProps {
  tokenMint: string;
  cluster: string;
  symbol: string;
}

const COPY_RESET_MS = 1500;

export function CpegContractBar({ tokenMint, cluster, symbol }: CpegContractBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tokenMint);
      } else if (typeof document !== "undefined") {
        // Older browsers/Phantom mobile webview fallback path. Build a hidden textarea,
        // select it, and call execCommand. We avoid this on the modern path because it
        // briefly steals focus away from the mint area on iOS Safari.
        const textarea = document.createElement("textarea");
        textarea.value = tokenMint;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // The user can still copy the address from the visible text node, so we silently
      // ignore clipboard rejections (e.g. permission denied in private mode).
    }
  }, [tokenMint]);

  // Each aggregator gets a deep link that already filters to the cPEG mint. We use the
  // canonical public URLs. Devnet falls back to Solana Explorer / Solscan only because
  // aggregators (Birdeye, Jupiter, DEXScreener, GeckoTerminal) do not index devnet.
  const explorerSuffix = cluster === "devnet" ? "?cluster=devnet" : "";
  const isMainnet = cluster === "mainnet-beta" || cluster === "mainnet";

  const explorerLinks: Array<{ label: string; href: string }> = [
    {
      label: "Solana Explorer",
      href: `https://explorer.solana.com/address/${tokenMint}${explorerSuffix}`,
    },
    {
      label: "Solscan",
      href: `https://solscan.io/token/${tokenMint}${cluster === "devnet" ? "?cluster=devnet" : ""}`,
    },
  ];

  const dexLinks: Array<{ label: string; href: string; emphasis?: boolean }> = isMainnet
    ? [
        {
          label: "Trade on Jupiter",
          href: `https://jup.ag/swap/SOL-${tokenMint}`,
          emphasis: true,
        },
        { label: "DEXScreener", href: `https://dexscreener.com/solana/${tokenMint}` },
        { label: "Birdeye", href: `https://birdeye.so/token/${tokenMint}?chain=solana` },
        { label: "GeckoTerminal", href: `https://www.geckoterminal.com/solana/tokens/${tokenMint}` },
      ]
    : [];

  return (
    <div className="border border-neutral-200 bg-gradient-to-r from-[#53c7ff]/[0.07] via-white/80 to-amber-50/40 p-5 dark:border-white/10 dark:from-[#53c7ff]/[0.08] dark:via-white/[0.03] dark:to-[#f7f2df]/[0.05]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#53c7ff]">
            Contract address / {symbol}
          </p>
          <p className="mt-2 break-all font-mono text-base font-bold tracking-tight text-neutral-950 dark:text-[#f7f2df] md:text-lg">
            {tokenMint}
          </p>
          <p className="mt-2 text-xs leading-5 text-neutral-700 dark:text-white/55">
            This is the Token-2022 mint. Holding 1 whole unit equals one cPEG identity.
            {isMainnet
              ? " The same address works on every Solana DEX aggregator."
              : " Aggregator listings (Jupiter, Birdeye, DEXScreener) only index mainnet."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 border border-neutral-300 bg-white/95 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-800 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/15 dark:bg-black/40 dark:text-white/75"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {dexLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className={
              link.emphasis
                ? "inline-flex items-center gap-1.5 border border-[#f7f2df] bg-[#f7f2df] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-black transition hover:bg-[#53c7ff]"
                : "inline-flex items-center gap-1.5 border border-neutral-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-800 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/15 dark:text-white/72"
            }
          >
            {link.label}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ))}
        {explorerLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-neutral-200 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/10 dark:text-white/55"
          >
            {link.label}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ))}
      </div>
    </div>
  );
}
