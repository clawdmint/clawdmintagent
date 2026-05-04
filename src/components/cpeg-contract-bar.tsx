"use client";

import { useCallback, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";

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
      // Visible mint text remains copyable even if the Clipboard API is blocked.
    }
  }, [tokenMint]);

  const explorerSuffix = cluster === "devnet" ? "?cluster=devnet" : "";
  const links: Array<{ label: string; href: string }> = [
    {
      label: "Solana Explorer",
      href: `https://explorer.solana.com/address/${tokenMint}${explorerSuffix}`,
    },
    {
      label: "Solscan",
      href: `https://solscan.io/token/${tokenMint}${cluster === "devnet" ? "?cluster=devnet" : ""}`,
    },
  ];

  return (
    <div className="border border-neutral-200 bg-gradient-to-r from-[#53c7ff]/[0.07] via-white/80 to-amber-50/40 p-5 dark:border-white/10 dark:from-[#53c7ff]/[0.08] dark:via-white/[0.03] dark:to-[#f7f2df]/[0.05]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#53c7ff]">
            Token-2022 mint / {symbol}
          </p>
          <p className="mt-2 break-all font-mono text-base font-bold tracking-tight text-neutral-950 dark:text-[#f7f2df] md:text-lg">
            {tokenMint}
          </p>
          <p className="mt-2 text-xs leading-5 text-neutral-700 dark:text-white/55">
            This mint is the token side of the collection. One whole unit is paired with one
            PegRecord identity, and official cPEG routes move both together.
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
        {links.map((link) => (
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
