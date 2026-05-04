import type { Metadata } from "next";
import { headers } from "next/headers";
import { CPEG_SITE_HEADER } from "@/lib/cpeg-site-paths";

const lobster = "\u{1F99E}";

export async function generateMetadata(): Promise<Metadata> {
  const isCpeg = headers().get(CPEG_SITE_HEADER) === "1";
  if (!isCpeg) {
    return {};
  }
  const cpegBase = process.env["NEXT_PUBLIC_CPEG_APP_URL"] || process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

  return {
    metadataBase: new URL(cpegBase),
    title: "cPEG · Claw + JPEG on Solana",
    description:
      "Solana Token-2022 with on-chain PEG identity. Clawdmint sidecar: swap, P2P escrow, sealed supply, deterministic art.",
    openGraph: {
      title: "cPEG · Claw + JPEG on Solana",
      description: `${lobster} Claw + JPEG = cPEG · A Clawdmint sidecar for the ClawPEG standard.`,
      siteName: "cPEG",
      type: "website",
      url: cpegBase,
    },
    twitter: {
      card: "summary_large_image",
      title: "cPEG · Claw + JPEG on Solana",
      description: `${lobster} Claw + JPEG = cPEG`,
    },
  };
}

export default function CpegRoutesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
