import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // O parser lê prompts/offer-parser.md em tempo de execução.
  outputFileTracingIncludes: {
    "/**/*": ["./prompts/**/*"],
  },
};

export default nextConfig;
