/**
 * IPFS upload utilities using Pinata
 * Handles NFT metadata and image uploads
 */

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
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

const PINATA_API_KEY = process.env.PINATA_API_KEY || "";
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY || "";
const PINATA_JWT = process.env.PINATA_JWT || "";
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

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
    const formData = new FormData();
    
    const blob = file instanceof Buffer ? new Blob([file], { type: contentType }) : file;
    formData.append("file", blob, filename);

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
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
      url: `${PINATA_GATEWAY}/${cid}`,
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
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`,
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
      url: `${PINATA_GATEWAY}/${cid}`,
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
 */
export async function uploadCollectionMetadata(
  collectionMeta: CollectionMetadata,
  tokenMetadata: NFTMetadata[],
  collectionName: string
): Promise<UploadResult> {
  try {
    // Create metadata objects for the folder
    const files: Array<{ path: string; content: string }> = [];

    // Add collection.json
    files.push({
      path: "collection.json",
      content: JSON.stringify(collectionMeta, null, 2),
    });

    // Add individual token metadata (1.json, 2.json, etc.)
    tokenMetadata.forEach((meta, index) => {
      files.push({
        path: `${index + 1}.json`,
        content: JSON.stringify(meta, null, 2),
      });
    });

    // Upload as a folder
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: {
          files: files.reduce((acc, file) => {
            acc[file.path] = JSON.parse(file.content);
            return acc;
          }, {} as Record<string, object>),
        },
        pinataMetadata: { name: `${collectionName}-metadata` },
      }),
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
  if (ipfsUrl.startsWith("ipfs://")) {
    return `${PINATA_GATEWAY}/${ipfsUrl.replace("ipfs://", "")}`;
  }
  return ipfsUrl;
}
