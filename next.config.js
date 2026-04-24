/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Smaller client bundles (tree-shake per-icon / per-module where supported)
  experimental: {
    useWasmBinary: true,
    optimizePackageImports: ["lucide-react", "@tanstack/react-query"],
  },
  compiler: {
    removeConsole: process.env["NODE_ENV"] === "production" ? { exclude: ["error", "warn"] } : false,
  },
  async rewrites() {
    return [
      { source: "/og.png", destination: "/api/og" },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    // Allow IPFS gateway images
    domains: ["gateway.pinata.cloud", "ipfs.io", "cloudflare-ipfs.com"],
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    
    // Alias react-native-async-storage to browser shim
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": require("path").resolve(
        __dirname,
        "src/shims/async-storage.js"
      ),
      "@metaplex-foundation/umi$": require.resolve(
        "@metaplex-foundation/umi"
      ),
      "@metaplex-foundation/umi/serializers$": require.resolve(
        "@metaplex-foundation/umi/serializers"
      ),
      "@react-aria/interactions$": require("path").resolve(
        __dirname,
        "node_modules/@react-aria/interactions/dist/module.js"
      ),
      "@react-aria/utils$": require("path").resolve(
        __dirname,
        "node_modules/@react-aria/utils/dist/module.js"
      ),
      "@react-aria/ssr$": require("path").resolve(
        __dirname,
        "node_modules/@react-aria/ssr/dist/module.js"
      ),
      "@react-stately/flags$": require("path").resolve(
        __dirname,
        "node_modules/@react-stately/flags/dist/module.js"
      ),
      "unstorage$": require.resolve("unstorage"),
      "hls.js$": require.resolve("hls.js"),
    };
    
    return config;
  },
};

module.exports = nextConfig;
