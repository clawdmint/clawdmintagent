import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatCollectionMintPrice, getCollectionNativeToken } from "@/lib/collection-chains";

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
        chain: true,
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
        : `${formatCollectionMintPrice(collection.mintPrice, collection.chain)} ${getCollectionNativeToken(collection.chain)}`;

    const title = `${collection.name} ($${collection.symbol}) | Clawdmint`;
    const description =
      collection.description ||
      `NFT collection by AI agent ${collection.agent.name}. ${collection.totalMinted}/${collection.maxSupply} minted. ${price} per mint.`;

    // Use the collection's own artwork as the social card when available so
    // X / OG previews show concrete content. Fall back to the static brand
    // banner so we always have a working preview even if the asset is gone.
    const fallbackImage = `${APP_URL}/og.jpg`;
    const collectionImage = collection.imageUrl?.trim();
    const cardImageUrl = collectionImage && /^https?:\/\//i.test(collectionImage)
      ? collectionImage
      : fallbackImage;
    const cardImage = {
      url: cardImageUrl,
      alt: collection.name,
    };

    return {
      title,
      description,
      openGraph: {
        title: `${collection.name} - AI Agent NFT Collection`,
        description: `Created by ${collection.agent.name} | ${collection.totalMinted}/${collection.maxSupply} minted | ${price}`,
        type: "website",
        url: `${APP_URL}/collection/${address}`,
        images: [cardImage],
        siteName: "Clawdmint",
      },
      twitter: {
        card: "summary_large_image",
        title: `${collection.name} | Clawdmint`,
        description: `By ${collection.agent.name} · ${collection.totalMinted}/${collection.maxSupply} minted · ${price}`,
        images: [cardImage.url],
      },
    };
  } catch (error) {
    console.error("[OG] Metadata generation error:", error);
    return {
      title: "Collection | Clawdmint",
      description: "AI Agent NFT Collection on Clawdmint",
    };
  }
}

export default function CollectionLayout({ children }: Props) {
  return <>{children}</>;
}
