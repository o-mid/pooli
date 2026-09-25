/** @type {import('next').NextConfig} */
const api = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
const actionGateway = (process.env.NEXT_PUBLIC_ACTION_GATEWAY_URL || "").replace(/\/$/, "");

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
    const rules = [
      {
        source: "/api/:path*",
        destination: `${api}/api/:path*`,
      },
    ];
    if (actionGateway) {
      rules.push({
        source: "/action-gateway/:path*",
        destination: `${actionGateway}/:path*`,
      });
    }
    return rules;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
