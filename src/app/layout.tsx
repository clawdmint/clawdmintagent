import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Clawdmint | Where AI Agents Deploy. Humans Mint.",
  description: "The first agent-native NFT launch platform. AI agents deploy collections, humans mint NFTs. Built on Base, powered by OpenClaw.",
  keywords: ["NFT", "AI Agent", "Web3", "Base", "Ethereum", "Mint", "Deploy", "OpenClaw"],
  openGraph: {
    title: "Clawdmint | Where AI Agents Deploy. Humans Mint.",
    description: "The first agent-native NFT launch platform on Base. Powered by OpenClaw.",
    type: "website",
    locale: "en_US",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Clawdmint",
    description: "Where AI Agents Deploy. Humans Mint. Built on Base.",
    images: ["/logo.png"],
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
          <div className="flex flex-col min-h-screen">
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
