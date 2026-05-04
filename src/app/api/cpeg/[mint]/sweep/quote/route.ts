import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const QuoteSchema = z.object({
  sol_amount: z.number().positive().max(1000),
  max_pegs: z.number().int().min(1).max(6).default(6),
});

interface RouteContext {
  params: { mint: string };
}

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Floor sweep quote endpoint for a cPEG collection.
 *
 * Goal: quote an identity-first cPEG purchase. The caller specifies how much SOL they
 * are willing to spend (and an upper bound on PEG count). The endpoint walks the cheapest
 * active listings, accumulates them until the budget is exhausted or the per-tx PEG cap is
 * hit (6, the cpeg-market batch cap), then returns the exact peg_ids alongside total cost
 * and weighted average price.
 *
 * The output plugs straight into the existing `/market/buy/batch/prepare` route, so this
 * endpoint stays read-only. It does not touch the chain. The collection page swap card
 * uses the response to render the exact PEG identities before the user clicks the button
 * to build and sign the batch buy transaction.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  let parsed: z.infer<typeof QuoteSchema>;
  try {
    const json = await request.json();
    const parseResult = QuoteSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    parsed = parseResult.data;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: { tokenMint: true, symbol: true, marketplaceFeeBps: true, royaltyBps: true },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const budgetLamports = BigInt(Math.floor(parsed.sol_amount * LAMPORTS_PER_SOL));
  const listings = await prisma.clawPegMarketListing.findMany({
    where: { tokenMint: launch.tokenMint, status: "ACTIVE" },
    orderBy: { priceLamports: "asc" },
    select: { pegId: true, priceLamports: true, sellerAddress: true },
    take: 32,
  });

  if (listings.length === 0) {
    return NextResponse.json({
      success: true,
      mint: launch.tokenMint,
      symbol: launch.symbol,
      quote: {
        peg_ids: [],
        peg_count: 0,
        total_lamports: "0",
        total_sol: 0,
        average_price_sol: 0,
        budget_remaining_sol: parsed.sol_amount,
        floor_sol: null,
        listings_in_book: 0,
      },
      reason: "Order book is empty.",
    });
  }

  // Greedy fill: accumulate cheapest listings until budget runs out or the per-tx batch
  // cap (6) is reached. We treat each listing's `priceLamports` as authoritative and
  // surface a warning if no listing fits the budget so the UI can suggest a top-up.
  let totalLamports = BigInt(0);
  const selected: Array<{ pegId: number; priceLamports: bigint; seller: string }> = [];
  for (const listing of listings) {
    if (selected.length >= parsed.max_pegs) break;
    const price = BigInt(listing.priceLamports);
    if (totalLamports + price > budgetLamports) break;
    totalLamports += price;
    selected.push({ pegId: listing.pegId, priceLamports: price, seller: listing.sellerAddress });
  }

  const floorPrice = BigInt(listings[0].priceLamports);
  const totalSol = Number(totalLamports) / LAMPORTS_PER_SOL;
  const avgPrice = selected.length > 0 ? totalSol / selected.length : 0;
  const remainingSol = Math.max(0, parsed.sol_amount - totalSol);

  return NextResponse.json({
    success: true,
    mint: launch.tokenMint,
    symbol: launch.symbol,
    quote: {
      peg_ids: selected.map((row) => row.pegId),
      peg_count: selected.length,
      total_lamports: totalLamports.toString(),
      total_sol: totalSol,
      average_price_sol: avgPrice,
      budget_remaining_sol: remainingSol,
      floor_sol: Number(floorPrice) / LAMPORTS_PER_SOL,
      listings_in_book: listings.length,
    },
    breakdown: selected.map((row) => ({
      peg_id: row.pegId,
      price_lamports: row.priceLamports.toString(),
      price_sol: Number(row.priceLamports) / LAMPORTS_PER_SOL,
      seller: row.seller,
    })),
  });
}
