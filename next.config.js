/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    };
    
    return config;
  },
};

module.exports = nextConfig;
