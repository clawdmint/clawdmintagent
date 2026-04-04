import { NextRequest, NextResponse } from "next/server";
import {
  getAgentRegistrationDocument,
  MetaplexAgentRegistryError,
} from "@/lib/metaplex-agent-registry";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const registration = await getAgentRegistrationDocument(id);

    return NextResponse.json(registration, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    if (error instanceof MetaplexAgentRegistryError) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.status }
      );
    }

    console.error("Get agent registration document error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to read agent registration document" },
      { status: 500 }
    );
  }
}
