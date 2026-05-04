import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { POST as prepareJupiterSwap } from "../../dex/jupiter/prepare/route";
import { POST as prepareMarketBatchBuy } from "../../market/buy/batch/prepare/route";

export const dynamic = "force-dynamic";

const RouterPrepareSchema = z
  .object({
    mode: z.enum(["amm_jupiter", "market_floor_sweep", "market_identity_buy"]).optional(),
    buyer: z.string().min(32),
    sol_amount: z.number().positive().max(2500).optional(),
    slippage_bps: z.number().int().min(10).max(2000).optional(),
    peg_ids: z.array(z.number().int().min(0)).min(1).max(6).optional(),
  })
  .superRefine((value, ctx) => {
    const mode = value.mode || (value.peg_ids?.length ? "market_identity_buy" : "amm_jupiter");
    if (mode === "amm_jupiter" && value.sol_amount === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sol_amount"], message: "sol_amount is required" });
    }
    if ((mode === "market_floor_sweep" || mode === "market_identity_buy") && !value.peg_ids?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["peg_ids"], message: "peg_ids are required" });
    }
  });

interface RouteContext {
  params: { mint: string };
}

function jsonRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = RouterPrepareSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const mode = parsed.data.mode || (parsed.data.peg_ids?.length ? "market_identity_buy" : "amm_jupiter");

  if (mode === "market_floor_sweep" || mode === "market_identity_buy") {
    const response = await prepareMarketBatchBuy(
      jsonRequest({
        buyer: parsed.data.buyer,
        peg_ids: parsed.data.peg_ids,
      }),
      context
    );
    response.headers.set("x-cpeg-router-mode", "market_identity_buy");
    return response;
  }

  const response = await prepareJupiterSwap(
    jsonRequest({
      buyer: parsed.data.buyer,
      sol_amount: parsed.data.sol_amount,
      slippage_bps: parsed.data.slippage_bps,
    }),
    context
  );
  response.headers.set("x-cpeg-router-mode", "amm_jupiter");
  return response;
}
