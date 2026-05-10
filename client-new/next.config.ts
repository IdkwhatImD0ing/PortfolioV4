import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion/react'],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.glb$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/media/[name].[hash][ext]',
      },
    });
    return config;
  },
};

export default nextConfig;
