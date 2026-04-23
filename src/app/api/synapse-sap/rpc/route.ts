/**
 * Optional legacy route: forwards Solana JSON-RPC to an HTTP merchant host when SYNAPSE_SAP_TOKEN is set.
 * Official Synapse Agent Protocol integration uses the SDK and on-chain x402 flow instead (see project docs / OOBE docs).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSynapseSapBaseUrl, getSynapseSapToken, shouldFallbackFromSynapseSap } from "@/lib/env";
import { getSolanaRpcUrl } from "@/lib/solana-collections";

export const dynamic = "force-dynamic";

type JsonRpcRequest = {
  id?: string | number | null;
  jsonrpc?: string;
  method?: string;
  params?: unknown[];
};

type SynapseRpcResponse = {
  success?: boolean;
  result?: unknown;
  error?: string;
  message?: string;
};

type SynapseTransactionResponse = {
  success?: boolean;
  signature?: string;
  result?: unknown;
  error?: string;
  message?: string;
};

function buildJsonRpcResponse(payload: JsonRpcRequest, body: Record<string, unknown>) {
  return {
    jsonrpc: payload.jsonrpc || "2.0",
    id: payload.id ?? null,
    ...body,
  };
}

async function callSynapseSap(path: string, payload: unknown) {
  const token = getSynapseSapToken();
  if (!token) {
    throw new Error("Synapse SAP token is not configured");
  }

  const response = await fetch(`${getSynapseSapBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(`Synapse SAP returned ${response.status}${text ? `: ${text}` : ""}`);
  }

  return data;
}

async function fallbackToRpc(request: NextRequest) {
  const body = await request.text();
  const response = await fetch(getSolanaRpcUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];

  if (Array.isArray(payload) || !payload?.method) {
    return NextResponse.json(
      buildJsonRpcResponse(
        Array.isArray(payload) ? {} : payload || {},
        {
          error: {
            code: -32600,
            message: "Invalid Request",
          },
        },
      ),
      { status: 200 },
    );
  }

  try {
    if (payload.method === "sendTransaction") {
      const [transaction, options] = payload.params || [];
      if (typeof transaction !== "string" || !transaction) {
        return NextResponse.json(
          buildJsonRpcResponse(payload, {
            error: {
              code: -32602,
              message: "Invalid sendTransaction params",
            },
          }),
          { status: 200 },
        );
      }

      const sapResult = (await callSynapseSap("/api/ai/transaction", {
        transaction,
        options: typeof options === "object" && options !== null ? options : undefined,
      })) as SynapseTransactionResponse;

      return NextResponse.json(
        buildJsonRpcResponse(payload, {
          result: sapResult.signature ?? sapResult.result ?? null,
        }),
        { status: 200 },
      );
    }

    const sapResult = (await callSynapseSap("/api/ai/rpc", {
      method: payload.method,
      params: payload.params || [],
    })) as SynapseRpcResponse;

    if (sapResult.error) {
      return NextResponse.json(
        buildJsonRpcResponse(payload, {
          error: {
            code: -32000,
            message: sapResult.error,
          },
        }),
        { status: 200 },
      );
    }

    return NextResponse.json(
      buildJsonRpcResponse(payload, {
        result: sapResult.result ?? null,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (shouldFallbackFromSynapseSap()) {
      return fallbackToRpc(request.clone());
    }

    const message = error instanceof Error ? error.message : "Synapse SAP request failed";
    return NextResponse.json(
      buildJsonRpcResponse(payload, {
        error: {
          code: -32001,
          message,
        },
      }),
      { status: 200 },
    );
  }
}
