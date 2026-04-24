/** @type {import('next').NextConfig} */
const api = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const nextConfig = {
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
