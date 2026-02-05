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

// ═══════════════════════════════════════════════════════════════════════
// SECURITY: URL validation to prevent SSRF attacks
// ═══════════════════════════════════════════════════════════════════════

const ALLOWED_IMAGE_DOMAINS = [
  // Public image hosting
  "i.imgur.com",
  "imgur.com",
  "pbs.twimg.com",
  "abs.twimg.com",
  // IPFS gateways
  "gateway.pinata.cloud",
  "ipfs.io",
  "cloudflare-ipfs.com",
  "dweb.link",
  "nftstorage.link",
  "w3s.link",
  // AI image generators
  "oaidalleapiprodscus.blob.core.windows.net", // DALL-E
  "replicate.delivery",
  "cdn.midjourney.com",
  // Cloud storage
  "storage.googleapis.com",
  "s3.amazonaws.com",
  // General CDNs
  "res.cloudinary.com",
  "images.unsplash.com",
];

const BLOCKED_IP_RANGES = [
  /^127\./,          // Loopback
  /^10\./,           // Private Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // Private Class B
  /^192\.168\./,     // Private Class C
  /^169\.254\./,     // Link-local
  /^0\./,            // Current network
  /^::1$/,           // IPv6 loopback
  /^fc00:/,          // IPv6 unique local
  /^fe80:/,          // IPv6 link-local
];

function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  try {
    const url = new URL(urlString);
    
    // SECURITY: Only allow HTTPS
    if (url.protocol !== "https:") {
      return { safe: false, reason: "Only HTTPS URLs are allowed" };
    }

    // SECURITY: Block IP addresses (prevent SSRF to internal networks)
    const hostname = url.hostname;
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      // It's an IP address - check against blocked ranges
      if (BLOCKED_IP_RANGES.some((pattern) => pattern.test(hostname))) {
        return { safe: false, reason: "Internal IP addresses are not allowed" };
      }
      // Even public IPs are suspicious for image URLs
      return { safe: false, reason: "IP-based URLs are not allowed" };
    }

    // SECURITY: Block localhost variants
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return { safe: false, reason: "Local/internal hostnames are not allowed" };
    }

    // SECURITY: Check against allowlist
    const isDomainAllowed = ALLOWED_IMAGE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isDomainAllowed) {
      return { safe: false, reason: `Domain '${hostname}' is not in the allowed list` };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }
}

// Maximum image size: 10MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Upload an image from data URL or fetch from URL
 * SECURITY: URL sources are validated against an allowlist to prevent SSRF
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

      // SECURITY: Validate content type
      if (!contentType.startsWith("image/")) {
        throw new Error("Only image content types are allowed");
      }

      buffer = Buffer.from(matches[2], "base64");

      // SECURITY: Check file size
      if (buffer.length > MAX_IMAGE_SIZE) {
        throw new Error(`Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
      }
    } else if (imageSource.startsWith("https://")) {
      // SECURITY: Validate URL before fetching
      const validation = isUrlSafe(imageSource);
      if (!validation.safe) {
        throw new Error(`URL not allowed: ${validation.reason}`);
      }

      // Fetch from validated URL
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      try {
        const response = await fetch(imageSource, { 
          signal: controller.signal,
          redirect: "error", // SECURITY: Don't follow redirects (prevent SSRF via redirect)
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        contentType = response.headers.get("content-type") || "image/png";

        // SECURITY: Validate content type from response
        if (!contentType.startsWith("image/")) {
          throw new Error("Response is not an image");
        }

        // SECURITY: Check content-length header
        const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
        if (contentLength > MAX_IMAGE_SIZE) {
          throw new Error(`Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
        }

        buffer = Buffer.from(await response.arrayBuffer());

        // SECURITY: Double-check actual size
        if (buffer.length > MAX_IMAGE_SIZE) {
          throw new Error(`Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
        }
      } finally {
        clearTimeout(timeout);
      }
    } else if (imageSource.startsWith("ipfs://")) {
      // Already on IPFS
      return {
        success: true,
        cid: imageSource.replace("ipfs://", "").split("/")[0],
        url: imageSource,
      };
    } else {
      // SECURITY: Reject http:// and any other protocols
      throw new Error("Unsupported image source. Use HTTPS URLs, data URIs, or IPFS URIs.");
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
