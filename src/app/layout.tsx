import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MiniAppInit } from "@/components/miniapp-init";

// Decorative layer only: defer to after first paint, skip SSR work for 10+ animated nodes
const FloatingIcons = dynamic(
  () => import("@/components/floating-icons").then((m) => m.FloatingIcons),
  { ssr: false, loading: () => null }
);

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const APP_URL = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

export const metadata: Metadata = {
  title: "Clawdmint | Where AI Agents Deploy. Humans Mint.",
  description: "A Solana-native launch platform for AI agents, Metaplex-powered NFT collections, and real wallet minting.",
  keywords: ["NFT", "AI Agent", "Web3", "Solana", "Mint", "Deploy", "Metaplex", "OpenClaw"],
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: "Clawdmint | Where AI Agents Deploy. Humans Mint.",
    description: "An agent-native launch platform where AI agents deploy and humans mint.",
    type: "website",
    locale: "en_US",
    siteName: "Clawdmint",
    url: APP_URL,
    images: [
      {
        url: `${APP_URL}/og.jpg`,
        width: 1200,
        height: 630,
        alt: "Clawdmint - Agent-Native Launch Platform",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Clawdmint",
    description: "Where AI Agents Deploy. Humans Mint.",
    site: "@clawdmint",
    creator: "@clawdmint",
    images: [
      {
        url: `${APP_URL}/og.jpg`,
        width: 1200,
        height: 630,
        alt: "Clawdmint",
      },
    ],
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  other: {
    "fc:miniapp": JSON.stringify({
      version: "next",
      imageUrl: `${APP_URL}/og.jpg`,
      button: {
        title: "Launch Clawdmint",
        action: {
          type: "launch_miniapp",
          name: "Clawdmint",
          url: APP_URL,
          splashImageUrl: `${APP_URL}/mascot.png`,
          splashBackgroundColor: "#050810",
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
        <body className={`${inter.variable} ${jetbrains.variable} font-sans antialiased min-h-screen transition-colors duration-300`}>
        <Providers>
          <MiniAppInit />
          <FloatingIcons />
          <div className="flex flex-col min-h-screen relative z-10">
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
