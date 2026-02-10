import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Revealed metadata resolver.
 * Maps token IDs to correct IPFS batch CID.
 * GET /api/metadata/revealed/:tokenId.json
 * 
 * Reads batch CIDs from output/ipfs-cids.json and resolves
 * each token to its correct IPFS gateway URL.
 */

// Cache the CID map in memory
let cidMap: { tokenId: number; cid: string }[] | null = null;
let metadataCid: string | null = null;

function loadCids() {
  if (cidMap !== null) return;
  
  try {
    const cidsPath = path.join(process.cwd(), "output", "ipfs-cids.json");
    const cids = JSON.parse(fs.readFileSync(cidsPath, "utf8"));
    
    // Check if metadata is a single CID or batched
    if (typeof cids.metadata === "string") {
      metadataCid = cids.metadata;
      cidMap = [];
      return;
    }
    
    if (cids.metadata?.batched && cids.metadata?.batchCids) {
      cidMap = [];
      for (const batch of cids.metadata.batchCids) {
        for (const fileName of batch.files) {
          const id = parseInt(fileName.replace(".json", ""));
          if (!isNaN(id)) {
            cidMap.push({ tokenId: id, cid: batch.cid });
          }
        }
      }
    }
  } catch {
    cidMap = [];
  }
}

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { tokenId: string } }
) {
  loadCids();
  
  const raw = params.tokenId.replace(".json", "");
  const tokenId = parseInt(raw);
  
  if (isNaN(tokenId) || tokenId < 1 || tokenId > 10000) {
    return NextResponse.json({ error: "Invalid token ID" }, { status: 404 });
  }

  // If we have a single metadata CID, redirect to IPFS
  if (metadataCid) {
    const ipfsUrl = `${IPFS_GATEWAY}/${metadataCid}/${tokenId}.json`;
    return NextResponse.redirect(ipfsUrl, 302);
  }

  // Find the correct batch for this token
  const entry = cidMap?.find(e => e.tokenId === tokenId);
  if (!entry) {
    // Fallback: try to serve from local output dir
    try {
      const localPath = path.join(process.cwd(), "output", "metadata", `${tokenId}.json`);
      const metadata = JSON.parse(fs.readFileSync(localPath, "utf8"));
      return NextResponse.json(metadata, {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
  }

  const ipfsUrl = `${IPFS_GATEWAY}/${entry.cid}/${tokenId}.json`;
  return NextResponse.redirect(ipfsUrl, 302);
}
