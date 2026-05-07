import { Connection } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  describeClawPegRecordStatus,
  findPegRecordAddress,
  parseClawPegRecordAccount,
} from "@/lib/clawpeg";
import { getClawPegTraits } from "@/lib/clawpeg-renderer";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 72;
const SCORE_WINDOW = 96;

interface PegRecordView {
  status: number;
  statusLabel: string;
  owner: string;
  seed: string;
  mintedSlot: string;
  transferredSlot: string;
  burnedSlot: string;
}

function parsePegRecord(data: Buffer): PegRecordView | null {
  if (data.length < 126 || data[0] !== 1) {
    return null;
  }
  const record = parseClawPegRecordAccount(data);
  return {
    status: record.status,
    statusLabel: describeClawPegRecordStatus(record.status),
    owner: record.owner,
    seed: record.seed,
    mintedSlot: record.mintedSlot.toString(),
    transferredSlot: record.transferredSlot.toString(),
    burnedSlot: record.burnedSlot.toString(),
  };
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isBase58ish(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function shortAddress(value: string | null | undefined) {
  if (!value) return null;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function rarityPercent(rank: number) {
  const percent = Math.max(0.01, (10_000 - rank) / 100);
  return `${percent.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function visualScore(rank: number) {
  return rank;
}

function buildCandidateIds(maxPegs: number, search: string, sort: string, offset: number, limit: number) {
  const numericSearch = /^\d+$/.test(search) ? Number.parseInt(search, 10) : null;
  if (numericSearch && numericSearch >= 1 && numericSearch <= maxPegs) {
    return [numericSearch];
  }

  const windowSize = sort === "age" ? Math.min(maxPegs, offset + limit) : Math.min(maxPegs, SCORE_WINDOW);
  const ids = Array.from({ length: windowSize }, (_, index) => index + 1);
  if (sort === "age") {
    return ids.slice(offset, offset + limit);
  }
  return ids;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedMint = (searchParams.get("mint") || "").trim();
  const search = (searchParams.get("q") || "").trim();
  const sort = searchParams.get("sort") === "age" ? "age" : "visual";
  const limit = clampInt(searchParams.get("limit"), 36, 1, MAX_LIMIT);
  const offset = clampInt(searchParams.get("offset"), 0, 0, 100_000);

  const launches = await prisma.clawPegLaunch
    .findMany({
      where: { status: { in: ["ACTIVE", "LAUNCHED"] }, collectionAddress: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        name: true,
        symbol: true,
        tokenMint: true,
        collectionAddress: true,
        cluster: true,
        rendererId: true,
        rendererVersion: true,
        rendererHash: true,
        collectionSeed: true,
        rendererParams: true,
        maxPegs: true,
        identityMode: true,
        canonicalRoot: true,
        agentAssetAddress: true,
        agentIdentityPda: true,
        createdAt: true,
        launchedAt: true,
      },
    })
    .catch(() => []);

  if (launches.length === 0) {
    return NextResponse.json({
      success: true,
      collections: [],
      selected_collection: null,
      stats: { cpegs: 0, holders: 0, minted: 0 },
      page: { offset, limit, next_offset: null, previous_offset: null },
      pegs: [],
    });
  }

  const selected =
    launches.find((launch) => launch.tokenMint === requestedMint) ||
    (isBase58ish(search) ? launches.find((launch) => launch.tokenMint === search) : null) ||
    launches[0];

  const candidateIds = buildCandidateIds(selected.maxPegs, search, sort, offset, limit);
  const pegAddresses = candidateIds.map((pegId) => findPegRecordAddress(selected.collectionAddress || "", pegId));
  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const accounts = pegAddresses.length
    ? await connection.getMultipleAccountsInfo(pegAddresses, "confirmed").catch(() => [])
    : [];

  const ownerFilter = isBase58ish(search) && search !== selected.tokenMint ? search : "";
  const sortedPegs = candidateIds
    .map((pegId, index) => {
      const traits = getClawPegTraits({
        rendererId: selected.rendererId,
        rendererVersion: selected.rendererVersion,
        collectionSeed: selected.collectionSeed,
        tokenMint: selected.tokenMint,
        pegId,
        params: (selected.rendererParams as Record<string, unknown> | null) || {},
      });
      const record = accounts[index]?.data ? parsePegRecord(Buffer.from(accounts[index]?.data || [])) : null;
      const rank = Number(traits.rank || 0);
      const score = visualScore(rank);
      return {
        id: pegId,
        name: `${selected.symbol} cPEG #${pegId}`,
        collection_name: selected.name,
        collection_symbol: selected.symbol,
        token_mint: selected.tokenMint,
        peg_record: pegAddresses[index]?.toBase58() || null,
        image: `/api/cpeg/${selected.tokenMint}/pegs/${pegId}/svg`,
        detail_url: `/api/cpeg/${selected.tokenMint}/pegs/${pegId}`,
        minted: Boolean(record),
        owner: record?.owner || null,
        owner_short: shortAddress(record?.owner),
        status: record?.statusLabel || null,
        on_chain_seed: record?.seed || null,
        minted_slot: record?.mintedSlot || null,
        transferred_slot: record?.transferredSlot || null,
        burned_slot: record?.burnedSlot || null,
        visual_score: score,
        rarity_percent: rarityPercent(rank),
        traits,
      };
    })
    .filter((peg) => (ownerFilter ? peg.owner === ownerFilter : true))
    .sort((a, b) => {
      if (sort === "age") return a.id - b.id;
      return b.visual_score - a.visual_score;
    });
  const pegs = sort === "age" ? sortedPegs.slice(0, limit) : sortedPegs.slice(offset, offset + limit);

  const mintedCount = pegs.filter((peg) => peg.minted).length;
  const holderCount = new Set(pegs.map((peg) => peg.owner).filter(Boolean)).size;
  const pageCeiling = sort === "age" ? selected.maxPegs : Math.min(selected.maxPegs, SCORE_WINDOW);
  const nextOffset = offset + limit < pageCeiling ? offset + limit : null;

  return NextResponse.json({
    success: true,
    collections: launches.map((launch) => ({
      id: launch.id,
      name: launch.name,
      symbol: launch.symbol,
      token_mint: launch.tokenMint,
      max_pegs: launch.maxPegs,
      cluster: launch.cluster,
      identity_mode: launch.identityMode,
      agent_asset_address: launch.agentAssetAddress,
    })),
    selected_collection: {
      id: selected.id,
      name: selected.name,
      symbol: selected.symbol,
      token_mint: selected.tokenMint,
      collection_address: selected.collectionAddress,
      identity_mode: selected.identityMode,
      canonical_root: selected.canonicalRoot,
      agent_asset_address: selected.agentAssetAddress,
      agent_identity_pda: selected.agentIdentityPda,
      cluster: selected.cluster,
      renderer: `${selected.rendererId}@${selected.rendererVersion}`,
      renderer_hash: selected.rendererHash,
      max_pegs: selected.maxPegs,
      created_at: selected.createdAt.toISOString(),
      launched_at: selected.launchedAt?.toISOString() || null,
    },
    stats: {
      cpegs: selected.maxPegs,
      holders: holderCount,
      minted: mintedCount,
    },
    page: {
      offset,
      limit,
      next_offset: nextOffset,
      previous_offset: offset > 0 ? Math.max(0, offset - limit) : null,
    },
    pegs,
  });
}
