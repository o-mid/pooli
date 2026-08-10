/** @type {import('next').NextConfig} */
const api = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const nextConfig = {
  output: "standalone",
  webpack: (config) => {
    // WalletConnect / web3 optional Node polyfills
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${api}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
