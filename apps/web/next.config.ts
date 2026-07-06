import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Emit a self-contained server (only the traced node_modules) for a slim image.
  output: "standalone",
  // Monorepo: trace from the repo root so workspace deps resolve correctly.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
