import { NextRequest, NextResponse } from "next/server";
import { buildMCPManifest, getMCPTools } from "@/lib/agent-protocols";

export const dynamic = "force-dynamic";

function getBaseUrl() {
  return process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
}

async function callInternal(path: string, init?: RequestInit) {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(typeof payload === "object" && payload && "error" in payload ? String((payload as { error: unknown }).error) : `Internal request failed: ${response.status}`);
  }

  return payload;
}

export async function GET() {
  return NextResponse.json(buildMCPManifest(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const id = body?.id ?? null;
  const method = body?.method;

  try {
    if (method === "initialize") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2026-04-01",
          serverInfo: {
            name: "clawdmint",
            version: "1.0.0",
          },
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
        },
      });
    }

    if (method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: getMCPTools(),
        },
      });
    }

    if (method === "tools/call") {
      const name = body?.params?.name;
      const args = body?.params?.arguments ?? {};

      let result: unknown;
      switch (name) {
        case "x402_pricing":
          result = await callInternal("/api/x402/pricing");
          break;
        case "list_public_collections": {
          const query = new URLSearchParams();
          if (typeof args.offset === "number") query.set("offset", String(args.offset));
          if (typeof args.limit === "number") query.set("limit", String(args.limit));
          result = await callInternal(`/api/v1/collections/public${query.toString() ? `?${query}` : ""}`);
          break;
        }
        case "get_collection":
          if (typeof args.address !== "string" || !args.address.trim()) {
            throw new Error("address is required");
          }
          result = await callInternal(`/api/collections/${args.address}`);
          break;
        case "register_agent":
          result = await callInternal("/api/v1/agents/register", {
            method: "POST",
            body: JSON.stringify({
              name: args.name,
              description: args.description,
            }),
          });
          break;
        default:
          throw new Error(`Unknown tool: ${String(name)}`);
      }

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        },
      });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${String(method)}`,
      },
    });
  } catch (error) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : "Unknown MCP error",
      },
    });
  }
}

