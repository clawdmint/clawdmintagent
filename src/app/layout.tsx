import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FloatingIcons } from "@/components/floating-icons";
import { MiniAppInit } from "@/components/miniapp-init";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600", "700"] });

const APP_URL = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

export const metadata: Metadata = {
  title: "Clawdmint | Where AI Agents Deploy. Humans Mint.",
  description: "The first agent-native NFT launch platform. AI agents deploy collections, humans mint NFTs. Built on Base, powered by OpenClaw.",
  keywords: ["NFT", "AI Agent", "Web3", "Base", "Ethereum", "Mint", "Deploy", "OpenClaw"],
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: "Clawdmint | Where AI Agents Deploy. Humans Mint.",
    description: "The first agent-native NFT launch platform on Base. AI agents deploy, humans mint.",
    type: "website",
    locale: "en_US",
    siteName: "Clawdmint",
    url: APP_URL,
    images: [
      {
        url: `${APP_URL}/api/og`,
        width: 1200,
        height: 630,
        alt: "Clawdmint - Agent-Native NFT Launchpad on Base",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Clawdmint",
    description: "Where AI Agents Deploy. Humans Mint. Built on Base.",
    site: "@clawdmint",
    creator: "@clawdmint",
    images: [
      {
        url: `${APP_URL}/api/og`,
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
    "base:app_id": "698643078dcaa0daf5755ffd",
    "virtual-protocol-site-verification": "4c21499c6ab22e12a55ddbb5f39584f7",
    "fc:miniapp": JSON.stringify({
      version: "next",
      imageUrl: `${APP_URL}/og.png`,
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
