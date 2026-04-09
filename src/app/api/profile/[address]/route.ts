import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isSupportedWalletAddress, normalizeWalletAddress } from "@/lib/network-config";
import { formatCollectionMintPrice, getCollectionNativeToken, SOLANA_COLLECTION_CHAINS } from "@/lib/collection-chains";
import { syncRecentMetaplexMintsForWallet } from "@/lib/metaplex-mint-backfill";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/profile/[address]
// Get mint history for a wallet address
// ═══════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    // Validate address
    if (!address || !isSupportedWalletAddress(address)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const normalizedAddress = normalizeWalletAddress(address);

    if (normalizedAddress && !normalizedAddress.startsWith("0x")) {
      await syncRecentMetaplexMintsForWallet(normalizedAddress).catch((error) => {
        console.warn("[Profile] Mint sync warning:", error);
      });
    }

    const ownedAssets = await prisma.asset.findMany({
      where: {
        ownerAddress: {
          equals: normalizedAddress,
          mode: "insensitive",
        },
        collection: {
          chain: { in: SOLANA_COLLECTION_CHAINS },
        },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        collection: {
          select: {
            id: true,
            name: true,
            symbol: true,
            address: true,
            chain: true,
            imageUrl: true,
            status: true,
            agent: {
              select: {
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        listings: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            priceLamports: true,
            createdAt: true,
          },
        },
      },
    });

    // Get all mints for this wallet
    const mints = await prisma.mint.findMany({
      where: {
        minterAddress: {
          equals: normalizedAddress,
          mode: "insensitive",
        },
        collection: {
          chain: { in: SOLANA_COLLECTION_CHAINS },
        },
      },
      orderBy: { mintedAt: "desc" },
      include: {
        collection: {
          select: {
            name: true,
            symbol: true,
            address: true,
            chain: true,
            imageUrl: true,
            mintPrice: true,
            maxSupply: true,
            totalMinted: true,
            status: true,
            agent: {
              select: {
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Fetch token launches for this wallet
    const tokenLaunches = await prisma.tokenLaunch.findMany({
      where: {
        launcherAddress: {
          equals: normalizedAddress,
          mode: "insensitive",
        },
        simulated: false,
        chain: { in: SOLANA_COLLECTION_CHAINS },
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregate stats
    const totalOwnedNfts = ownedAssets.length;
    const totalSpentWei = mints.reduce((sum, m) => sum + BigInt(m.totalPaid || "0"), BigInt(0));
    const uniqueCollections = new Set(ownedAssets.map((asset) => asset.collectionId)).size;

    return NextResponse.json({
      success: true,
      profile: {
        address,
        total_nfts: totalOwnedNfts,
        total_spent_wei: totalSpentWei.toString(),
        unique_collections: uniqueCollections,
        total_transactions: mints.length,
        total_launches: tokenLaunches.length,
      },
      owned_assets: ownedAssets.map((asset) => ({
        id: asset.id,
        asset_address: asset.assetAddress,
        token_id: asset.tokenId,
        name: asset.name,
        image_url: asset.imageUrl,
        metadata_uri: asset.metadataUri,
        minted_at: asset.mintedAt.toISOString(),
        collection: {
          id: asset.collection.id,
          name: asset.collection.name,
          symbol: asset.collection.symbol,
          address: asset.collection.address,
          chain: asset.collection.chain,
          image_url: asset.collection.imageUrl,
          status: asset.collection.status,
          agent_name: asset.collection.agent.name,
          agent_avatar: asset.collection.agent.avatarUrl,
        },
        active_listing: asset.listings[0]
          ? {
              id: asset.listings[0].id,
              price_lamports: asset.listings[0].priceLamports,
              price_native: formatCollectionMintPrice(asset.listings[0].priceLamports, "solana"),
              created_at: asset.listings[0].createdAt.toISOString(),
            }
          : null,
      })),
      mints: mints.map((m) => ({
        id: m.id,
        quantity: m.quantity,
        total_paid: m.totalPaid,
        tx_hash: m.txHash,
        token_ids: Array.from(
          { length: m.endTokenId - m.startTokenId + 1 },
          (_, i) => m.startTokenId + i
        ),
        minted_at: m.mintedAt.toISOString(),
        collection: {
          name: m.collection.name,
          symbol: m.collection.symbol,
          address: m.collection.address,
          chain: m.collection.chain,
          image_url: m.collection.imageUrl,
          status: m.collection.status,
          mint_price_native: formatCollectionMintPrice(m.collection.mintPrice, m.collection.chain),
          native_token: getCollectionNativeToken(m.collection.chain),
          agent_name: m.collection.agent.name,
          agent_avatar: m.collection.agent.avatarUrl,
        },
      })),
      tokenLaunches: tokenLaunches.map((l) => ({
        id: l.id,
        tokenName: l.tokenName,
        tokenSymbol: l.tokenSymbol,
        tokenAddress: l.tokenAddress,
        txHash: l.txHash,
        chain: l.chain,
        description: l.description,
        imageUrl: l.imageUrl,
        websiteUrl: l.websiteUrl,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[Profile] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load profile" },
      { status: 500 }
    );
  }
}
