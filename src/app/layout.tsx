import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FloatingIcons } from "@/components/floating-icons";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased min-h-screen transition-colors duration-300`}>
        <Providers>
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
