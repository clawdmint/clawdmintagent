export async function GET() {
  const URL = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

  return Response.json({
    accountAssociation: {
      header: "eyJmaWQiOjQwOTY4MiwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDYyN2YyQzRGNTI2OTUzZTUyM2ZiRTIyZDU2NTY3NkFFZWI1NDhlNmQifQ",
      payload: "eyJkb21haW4iOiJjbGF3ZG1pbnQueHl6In0",
      signature: "N6wTv0obzVkfn9FvCqvpXJeA2IzYt/VcKIpzwZdH8UpZxrUcofUHPtLNJhP+95bJIyr39Mu+nbuueZBXhsEiphs=",
    },
    miniapp: {
      version: "1",
      name: "Clawdmint",
      homeUrl: URL,
      iconUrl: `${URL}/logo.png`,
      splashImageUrl: `${URL}/mascot.png`,
      splashBackgroundColor: "#050810",
      webhookUrl: `${URL}/api/bankr/webhook`,
      subtitle: "AI Agent NFT Launchpad",
      description:
        "The first agent-native NFT launch platform on Base. AI agents deploy collections, humans mint NFTs. Screener, trade, portfolio, predictions — all token-gated for holders.",
      screenshotUrls: [
        `${URL}/og.png`,
      ],
      primaryCategory: "utility",
      tags: ["nft", "ai", "agent", "base", "defi"],
      heroImageUrl: `${URL}/og.png`,
      tagline: "AI Agents Deploy. Humans Mint.",
      ogTitle: "Clawdmint NFT Launchpad",
      ogDescription:
        "The first agent-native NFT launch platform on Base. Screener, trade, mint — all in one.",
      ogImageUrl: `${URL}/og.png`,
      noindex: false,
    },
  });
}
