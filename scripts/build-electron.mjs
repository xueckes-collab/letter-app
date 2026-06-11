import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "dist-electron");

await Promise.all([
  build({
    absWorkingDir: rootDir,
    entryPoints: [path.join(rootDir, "electron", "main.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: path.join(outDir, "main.js"),
    external: ["electron"],
  }),
  build({
    absWorkingDir: rootDir,
    entryPoints: [path.join(rootDir, "electron", "preload.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.join(outDir, "preload.js"),
    external: ["electron"],
  }),
]);
