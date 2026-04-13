import { NextResponse } from "next/server";
import { buildA2ACard } from "@/lib/agent-protocols";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildA2ACard(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}

