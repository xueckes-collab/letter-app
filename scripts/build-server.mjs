import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  absWorkingDir: rootDir,
  entryPoints: [path.join(rootDir, "server", "_core", "index.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.join(rootDir, "dist"),
  external: ["better-sqlite3", "vite"],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
});
