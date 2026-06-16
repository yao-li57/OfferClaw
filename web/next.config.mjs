/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'pdf-parse'],
  },
  webpack: (config) => {
    config.resolve.alias['canvas'] = false;
    return config;
  },
};

export default nextConfig;
