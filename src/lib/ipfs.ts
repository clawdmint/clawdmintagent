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

function sanitizeFolderName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "collection";
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION (lazy loaded)
// ═══════════════════════════════════════════════════════════════════════

function getPinataConfig() {
  return {
    apiKey: getEnv("PINATA_API_KEY").trim(),
    secretKey: getEnv("PINATA_SECRET_KEY").trim(),
    jwt: getEnv("PINATA_JWT").trim(),
    gateway: "https://gateway.pinata.cloud/ipfs",
  };
}

function hasJwtShape(token: string): boolean {
  return token.split(".").length === 3;
}

function getPinataAuthHeaders(config: ReturnType<typeof getPinataConfig>): HeadersInit {
  if (config.jwt && hasJwtShape(config.jwt)) {
    return {
      Authorization: `Bearer ${config.jwt}`,
    };
  }

  if (config.apiKey && config.secretKey) {
    return {
      pinata_api_key: config.apiKey,
      pinata_secret_api_key: config.secretKey,
    };
  }

  if (config.jwt) {
    throw new Error("Pinata JWT is malformed and API key fallback is not configured");
  }

  throw new Error("Pinata credentials are not configured");
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
      headers: getPinataAuthHeaders(config),
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
        ...getPinataAuthHeaders(config),
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
    const folderName = sanitizeFolderName(collectionName);
    
    // Create FormData for folder upload
    const formData = new FormData();
    
    // Add collection.json
    const collectionBlob = new Blob(
      [JSON.stringify(collectionMeta, null, 2)],
      { type: "application/json" }
    );
    formData.append("file", collectionBlob, `${folderName}/collection.json`);

    // Add individual token metadata (1.json, 2.json, etc.)
    tokenMetadata.forEach((meta, index) => {
      const tokenBlob = new Blob(
        [JSON.stringify(meta, null, 2)],
        { type: "application/json" }
      );
      formData.append("file", tokenBlob, `${folderName}/${index + 1}.json`);
    });

    // Add metadata
    const metadata = JSON.stringify({
      name: `${collectionName}-metadata`,
    });
    formData.append("pinataMetadata", metadata);

    // Upload folder to Pinata
    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: getPinataAuthHeaders(config),
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
const MAX_IMAGE_REDIRECTS = 5;
const MIN_IMAGE_WIDTH = 256;
const MIN_IMAGE_HEIGHT = 256;

interface ImageDimensions {
  width: number;
  height: number;
}

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readGifDimensions(buffer: Buffer): ImageDimensions | null {
  const signature = buffer.subarray(0, 6).toString("ascii");
  if (buffer.length < 10 || (signature !== "GIF87a" && signature !== "GIF89a")) {
    return null;
  }

  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame && offset + 8 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }

  const chunkType = buffer.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

function readSvgDimensions(buffer: Buffer): ImageDimensions | null {
  const markup = buffer.subarray(0, 4096).toString("utf8");
  if (!markup.includes("<svg")) {
    return null;
  }

  const widthMatch = markup.match(/\bwidth=["']([\d.]+)(px)?["']/i);
  const heightMatch = markup.match(/\bheight=["']([\d.]+)(px)?["']/i);
  if (widthMatch && heightMatch) {
    return {
      width: Math.round(Number(widthMatch[1])),
      height: Math.round(Number(heightMatch[1])),
    };
  }

  const viewBoxMatch = markup.match(/\bviewBox=["'][^"']*?([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)["']/i);
  if (viewBoxMatch) {
    return {
      width: Math.round(Number(viewBoxMatch[3])),
      height: Math.round(Number(viewBoxMatch[4])),
    };
  }

  return null;
}

function readImageDimensions(buffer: Buffer): ImageDimensions | null {
  return (
    readPngDimensions(buffer) ||
    readJpegDimensions(buffer) ||
    readGifDimensions(buffer) ||
    readWebpDimensions(buffer) ||
    readSvgDimensions(buffer)
  );
}

function validateImageDimensions(buffer: Buffer): void {
  const dimensions = readImageDimensions(buffer);
  if (!dimensions) {
    return;
  }

  if (dimensions.width < MIN_IMAGE_WIDTH || dimensions.height < MIN_IMAGE_HEIGHT) {
    throw new Error(
      `Image is too small (${dimensions.width}x${dimensions.height}). Use at least ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}.`
    );
  }
}

async function fetchSafeImageUrl(
  imageUrl: string,
  signal: AbortSignal
): Promise<Response> {
  let currentUrl = imageUrl;

  for (let redirectCount = 0; redirectCount <= MAX_IMAGE_REDIRECTS; redirectCount += 1) {
    const validation = isUrlSafe(currentUrl);
    if (!validation.safe) {
      throw new Error(`URL not allowed: ${validation.reason}`);
    }

    const response = await fetch(currentUrl, {
      signal,
      redirect: "manual",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Image URL redirect is missing a location header");
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects (max ${MAX_IMAGE_REDIRECTS})`);
}

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

      validateImageDimensions(buffer);
    } else if (imageSource.startsWith("https://")) {
      // Fetch from validated URL
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      try {
        const response = await fetchSafeImageUrl(imageSource, controller.signal);

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

        validateImageDimensions(buffer);
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

export function getUploadErrorMessage(error: unknown, fallback = "Upload failed"): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
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
