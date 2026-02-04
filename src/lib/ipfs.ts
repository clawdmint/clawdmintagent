/**
 * IPFS upload utilities using Pinata
 * Handles NFT metadata and image uploads
 * 
 * IMPORTANT: All env vars are read dynamically to prevent webpack inlining
 * NOTE: server-only removed because this may be imported indirectly by pages
 */
import { getEnv } from "./env";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface UploadResult {
  success: boolean;
  cid?: string;
  url?: string;
  error?: string;
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  external_url?: string;
}

export interface CollectionMetadata {
  name: string;
  description: string;
  image: string;
  external_link?: string;
  seller_fee_basis_points?: number;
  fee_recipient?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION (lazy loaded)
// ═══════════════════════════════════════════════════════════════════════

function getPinataConfig() {
  return {
    apiKey: getEnv("PINATA_API_KEY"),
    secretKey: getEnv("PINATA_SECRET_KEY"),
    jwt: getEnv("PINATA_JWT"),
    gateway: "https://gateway.pinata.cloud/ipfs",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// UPLOAD FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Upload a file to IPFS via Pinata
 */
export async function uploadFile(
  file: Buffer | Blob,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  try {
    const config = getPinataConfig();
    const formData = new FormData();
    
    const blob = Buffer.isBuffer(file)
      ? new Blob([new Uint8Array(file)], { type: contentType })
      : file;
    formData.append("file", blob, filename);

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.jwt}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const result = await response.json();
    const cid = result.IpfsHash;

    return {
      success: true,
      cid,
      url: `${config.gateway}/${cid}`,
    };
  } catch (error) {
    console.error("IPFS upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Upload JSON metadata to IPFS
 */
export async function uploadJson(
  data: object,
  name: string
): Promise<UploadResult> {
  try {
    const config = getPinataConfig();
    
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.jwt}`,
      },
      body: JSON.stringify({
        pinataContent: data,
        pinataMetadata: { name },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const result = await response.json();
    const cid = result.IpfsHash;

    return {
      success: true,
      cid,
      url: `${config.gateway}/${cid}`,
    };
  } catch (error) {
    console.error("IPFS JSON upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Upload an entire collection's metadata to IPFS
 * Creates a folder with individual token JSONs + collection.json
 * Uses Pinata's file-based upload for folder structure
 */
export async function uploadCollectionMetadata(
  collectionMeta: CollectionMetadata,
  tokenMetadata: NFTMetadata[],
  collectionName: string
): Promise<UploadResult> {
  try {
    const config = getPinataConfig();
    
    // Create FormData for folder upload
    const formData = new FormData();
    
    // Add collection.json
    const collectionBlob = new Blob(
      [JSON.stringify(collectionMeta, null, 2)],
      { type: "application/json" }
    );
    formData.append("file", collectionBlob, "collection.json");

    // Add individual token metadata (1.json, 2.json, etc.)
    tokenMetadata.forEach((meta, index) => {
      const tokenBlob = new Blob(
        [JSON.stringify(meta, null, 2)],
        { type: "application/json" }
      );
      formData.append("file", tokenBlob, `${index + 1}.json`);
    });

    // Add metadata
    const metadata = JSON.stringify({
      name: `${collectionName}-metadata`,
    });
    formData.append("pinataMetadata", metadata);

    // Add options for folder structure
    const options = JSON.stringify({
      wrapWithDirectory: true,
    });
    formData.append("pinataOptions", options);

    // Upload folder to Pinata
    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.jwt}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata folder upload failed: ${error}`);
    }

    const result = await response.json();
    const cid = result.IpfsHash;

    return {
      success: true,
      cid,
      url: `ipfs://${cid}/`,
    };
  } catch (error) {
    console.error("Collection metadata upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Upload an image from data URL or fetch from URL
 */
export async function uploadImage(
  imageSource: string,
  filename: string
): Promise<UploadResult> {
  try {
    let buffer: Buffer;
    let contentType: string;

    if (imageSource.startsWith("data:")) {
      // Parse data URL
      const matches = imageSource.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        throw new Error("Invalid data URL format");
      }
      contentType = matches[1];
      buffer = Buffer.from(matches[2], "base64");
    } else if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
      // Fetch from URL
      const response = await fetch(imageSource);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      contentType = response.headers.get("content-type") || "image/png";
      buffer = Buffer.from(await response.arrayBuffer());
    } else if (imageSource.startsWith("ipfs://")) {
      // Already on IPFS
      return {
        success: true,
        cid: imageSource.replace("ipfs://", "").split("/")[0],
        url: imageSource,
      };
    } else {
      throw new Error("Unsupported image source format");
    }

    return uploadFile(buffer, filename, contentType);
  } catch (error) {
    console.error("Image upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Image upload failed",
    };
  }
}

/**
 * Convert IPFS CID to gateway URL
 */
export function ipfsToHttp(ipfsUrl: string): string {
  const config = getPinataConfig();
  if (ipfsUrl.startsWith("ipfs://")) {
    return `${config.gateway}/${ipfsUrl.replace("ipfs://", "")}`;
  }
  return ipfsUrl;
}
