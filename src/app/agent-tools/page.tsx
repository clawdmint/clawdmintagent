import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Code2,
  ExternalLink,
  FileJson,
  KeyRound,
  Network,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  ERC8257_OPEN_ACCESS_PREDICATE,
  ERC8257_REGISTERED_CREATOR_ADDRESS,
  ERC8257_REGISTRY_ADDRESS,
  ERC8257_REGISTRY_CHAIN,
  getErc8257RegisteredTools,
} from "@/lib/erc8257-tools";

const APP_URL = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
const tools = getErc8257RegisteredTools(APP_URL);
const registryUrl = `https://basescan.org/address/${ERC8257_REGISTRY_ADDRESS}`;
const toolIndexUrl = `${APP_URL}/.well-known/ai-tool`;

export const metadata: Metadata = {
  title: "Clawdmint Agent Tools | ERC-8257 Registry",
  description:
    "Public ERC-8257 registry view for Clawdmint agent tools covering Solana NFT deploy, mint, buy, list, cancel, and agent-token launch flows.",
  alternates: {
    canonical: `${APP_URL}/agent-tools`,
  },
};

function shortHash(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function ExternalTextLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1.5 rounded-lg text-cyan-300 transition hover:text-cyan-200"
    >
      <span className="truncate">{children}</span>
      <ExternalLink className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
    </a>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Network;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
        <Icon className="h-4 w-4 text-cyan-300" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 truncate font-mono text-sm text-gray-100">{value}</div>
    </div>
  );
}

export default function AgentToolsPage() {
  return (
    <div className="min-h-screen bg-[rgb(var(--bg-primary))]">
      <section className="border-b border-white/[0.08] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                ERC-8257 registered
              </div>
              <h1 className="mt-5 text-4xl font-black leading-tight text-white sm:text-5xl">
                Clawdmint Agent Tools
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-400">
                Public registry view for Clawdmint tools that let agents deploy Solana NFT
                collections, mint from public collections, buy NFTs, list owned assets, cancel
                listings, and launch agent tokens.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <ExternalTextLink href={toolIndexUrl}>Tool index</ExternalTextLink>
              <ExternalTextLink href={registryUrl}>Base registry</ExternalTextLink>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryItem icon={Network} label="Registry chain" value={ERC8257_REGISTRY_CHAIN} />
            <SummaryItem icon={Code2} label="Tool count" value={`${tools.length} tools`} />
            <SummaryItem icon={KeyRound} label="Creator" value={shortHash(ERC8257_REGISTERED_CREATOR_ADDRESS)} />
            <SummaryItem icon={ShieldCheck} label="Access predicate" value={shortHash(ERC8257_OPEN_ACCESS_PREDICATE)} />
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-5">
          {tools.map((tool) => (
            <article
              key={tool.slug}
              className="grid gap-5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-5 shadow-2xl shadow-black/10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.07] px-2.5 py-1 font-mono text-xs font-semibold text-cyan-200">
                    #{tool.registration?.toolId ?? "unregistered"}
                  </span>
                  <span className="rounded-md border border-white/[0.08] px-2.5 py-1 font-mono text-xs text-gray-400">
                    {tool.execution}
                  </span>
                </div>

                <h2 className="mt-4 break-words font-mono text-xl font-bold text-white">
                  {tool.name}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">{tool.description}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {tool.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/[0.08] bg-black/10 px-2.5 py-1 text-xs text-gray-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid min-w-0 gap-3 rounded-lg border border-white/[0.06] bg-black/20 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                    <FileJson className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                    Manifest
                  </div>
                  <div className="mt-1 font-mono text-sm">
                    <ExternalTextLink href={tool.manifest}>{tool.slug}.json</ExternalTextLink>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                    <WalletCards className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                    Endpoint
                  </div>
                  <div className="mt-1 truncate font-mono text-sm text-gray-200">{tool.endpoint}</div>
                </div>

                {tool.registration ? (
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Registration tx
                    </div>
                    <div className="mt-1 font-mono text-sm">
                      <ExternalTextLink href={tool.registration.txUrl}>
                        {shortHash(tool.registration.txHash)}
                      </ExternalTextLink>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl rounded-lg border border-white/[0.08] bg-black/30 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Discovery endpoint</h2>
              <p className="mt-1 text-sm text-gray-400">
                The machine-readable ERC-8257 tool index is available as JSON.
              </p>
            </div>
            <Link
              href="/.well-known/ai-tool"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.08] px-4 py-3 font-mono text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/[0.12] md:w-auto"
            >
              Open index
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 p-4 font-mono text-sm text-gray-300">
            <code>{`GET ${toolIndexUrl}`}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}
