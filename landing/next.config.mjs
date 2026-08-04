/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/home.html" },
        { source: "/privacy", destination: "/privacy/index.html" },
        { source: "/terms", destination: "/terms/index.html" },
      ],
    };
  },
};

export default nextConfig;
