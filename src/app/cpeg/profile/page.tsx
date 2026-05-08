"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Copy, Loader2, PackageOpen, Tag } from "lucide-react";
import { useWallet } from "@/components/wallet-context";
import { truncateAddress } from "@/lib/cpeg-ui";

interface OwnedPeg {
  id: string;
  asset_address: string;
  token_mint: string;
  peg_id: number;
  symbol: string;
  name: string;
  image: string;
  collection_url: string;
  market_url: string;
}

interface ProfilePayload {
  success: boolean;
  owned?: OwnedPeg[];
  listed?: Array<{ id: string; token_mint: string; peg_id: number; symbol: string; image: string; collection_url: string; price_sol: string }>;
  launches?: Array<{ id: string; token_mint: string; name: string; symbol: string; max_pegs: number; status: string }>;
}

export default function CpegProfilePage() {
  const { address, isConnected, connectSolana, solanaAvailable } = useWallet();
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/profile/${address}/cpeg`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setPayload(body);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!isConnected) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-5 text-center text-[#f7f2df]">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#53c7ff]">cPEG profile</p>
        <h1 className="mt-4 text-4xl font-black uppercase">Connect your wallet.</h1>
        <p className="mt-4 text-sm leading-7 text-white/55">
          View captured cPEG identities, active listings, and agent-token collections in one place.
        </p>
        <button
          type="button"
          onClick={() => (solanaAvailable ? void connectSolana() : window.open("https://phantom.app/download", "_blank"))}
          className="mt-7 inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
        >
          <PackageOpen className="h-4 w-4" />
          {solanaAvailable ? "Connect Phantom" : "Install Phantom"}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 text-[#f7f2df] md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#53c7ff]">cPEG profile</p>
          <h1 className="mt-3 text-5xl font-black uppercase leading-none">Your PEGs</h1>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
            {address ? truncateAddress(address, 6, 6) : "wallet"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => address && navigator.clipboard.writeText(address)}
          className="inline-flex items-center gap-2 border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
        >
          <Copy className="h-3.5 w-3.5" /> Copy wallet
        </button>
      </div>

      {loading ? (
        <div className="mt-16 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#53c7ff]" />
        </div>
      ) : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">Captured identities</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
                {(payload?.owned || []).length} owned
              </span>
            </div>
            {(payload?.owned || []).length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(payload?.owned || []).map((peg) => (
                  <article key={peg.asset_address} className="border border-white/10 bg-white/[0.03] p-3">
                    <div className="aspect-square overflow-hidden border border-white/10 bg-black">
                      <Image src={peg.image} alt={`${peg.symbol} #${peg.peg_id}`} width={512} height={512} className="h-full w-full object-cover [image-rendering:pixelated]" />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase">{peg.symbol} #{peg.peg_id}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">{truncateAddress(peg.asset_address, 5, 5)}</p>
                      </div>
                      <Link href={`${peg.market_url}#list`} className="inline-flex items-center gap-1 border border-[#53c7ff]/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#53c7ff]">
                        <Tag className="h-3 w-3" /> List
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-white/12 py-16 text-center text-sm text-white/45">
                No captured cPEGs in this wallet yet.
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <div className="border border-white/10 bg-white/[0.03] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#ec5cff]">Active listings</p>
              <div className="mt-4 space-y-3">
                {(payload?.listed || []).length ? (
                  (payload?.listed || []).map((listing) => (
                    <Link key={listing.id} href={listing.collection_url} className="flex items-center gap-3 border border-white/10 p-2 hover:border-[#53c7ff]/50">
                      <Image src={listing.image} alt={`${listing.symbol} #${listing.peg_id}`} width={48} height={48} className="h-12 w-12 object-cover [image-rendering:pixelated]" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">
                        {listing.symbol} #{listing.peg_id}
                      </span>
                      <span className="font-mono text-[10px] text-[#53c7ff]">{listing.price_sol} SOL</span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-white/45">No active cPEG listings.</p>
                )}
              </div>
            </div>

            <div className="border border-white/10 bg-white/[0.03] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#53c7ff]">Your launches</p>
              <div className="mt-4 space-y-3">
                {(payload?.launches || []).length ? (
                  (payload?.launches || []).map((launch) => (
                    <Link key={launch.id} href={`/${launch.token_mint}`} className="flex items-center justify-between gap-3 border border-white/10 px-3 py-3 hover:border-[#53c7ff]/50">
                      <span>
                        <span className="block text-sm font-black uppercase">{launch.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{launch.symbol} / {launch.max_pegs.toLocaleString()} max</span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-[#53c7ff]" />
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-white/45">No cPEG launches from this wallet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
