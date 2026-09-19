import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This worktree sits inside a parent repo that has its own lockfile, so say
  // explicitly which directory is the root.
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default nextConfig;
