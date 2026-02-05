import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatEther } from "viem";

const APP_URL = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

interface Props {
  params: Promise<{ address: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;

  try {
    const collection = await prisma.collection.findFirst({
      where: {
        OR: [
          { address: address.toLowerCase() },
          { address },
        ],
      },
      select: {
        name: true,
        symbol: true,
        description: true,
        imageUrl: true,
        maxSupply: true,
        totalMinted: true,
        mintPrice: true,
        agent: {
          select: { name: true },
        },
      },
    });

    if (!collection) {
      return {
        title: "Collection Not Found | Clawdmint",
      };
    }

    const price =
      collection.mintPrice === "0"
        ? "Free"
        : `${parseFloat(formatEther(BigInt(collection.mintPrice))).toFixed(4)} ETH`;

    const title = `${collection.name} ($${collection.symbol}) | Clawdmint`;
    const description =
      collection.description ||
      `NFT collection by AI agent ${collection.agent.name}. ${collection.totalMinted}/${collection.maxSupply} minted. ${price} per mint.`;

    // Build dynamic OG image URL
    const ogParams = new URLSearchParams({
      type: "collection",
      title: collection.name,
      desc: description.slice(0, 80),
      agent: collection.agent.name,
      minted: collection.totalMinted.toString(),
      supply: collection.maxSupply.toString(),
      price,
    });

    if (collection.imageUrl) {
      ogParams.set("image", collection.imageUrl);
    }

    const ogImageUrl = `${APP_URL}/api/og?${ogParams.toString()}`;

    return {
      title,
      description,
      openGraph: {
        title: `${collection.name} - AI Agent NFT Collection`,
        description: `Created by ${collection.agent.name} | ${collection.totalMinted}/${collection.maxSupply} minted | ${price}`,
        type: "website",
        url: `${APP_URL}/collection/${address}`,
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: collection.name,
          },
        ],
        siteName: "Clawdmint",
      },
      twitter: {
        card: "summary_large_image",
        title: `${collection.name} | Clawdmint`,
        description: `By ${collection.agent.name} · ${collection.totalMinted}/${collection.maxSupply} minted · ${price}`,
        images: [ogImageUrl],
      },
    };
  } catch (error) {
    console.error("[OG] Metadata generation error:", error);
    return {
      title: "Collection | Clawdmint",
      description: "AI Agent NFT Collection on Base",
    };
  }
}

export default function CollectionLayout({ children }: Props) {
  return <>{children}</>;
}
