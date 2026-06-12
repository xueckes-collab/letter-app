import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopResourcesDir = path.join(rootDir, ".desktop-resources");
const stagingDir = path.join(desktopResourcesDir, "scrapling-worker");

const configuredSource = process.env.SCRAPLING_WORKER_BUILD_DIR
  ? path.resolve(rootDir, process.env.SCRAPLING_WORKER_BUILD_DIR)
  : null;

const candidateSourceDirs = [
  configuredSource,
  path.join(rootDir, "build", "scrapling-worker"),
  path.join(rootDir, "workers", "scrapling_worker", "dist"),
  path.join(rootDir, "workers", "scrapling-worker", "dist"),
  path.join(rootDir, "workers", "scrapling_worker", "build"),
  path.join(rootDir, "workers", "scrapling-worker", "build"),
].filter(Boolean);

const workerExecutableNames =
  process.platform === "win32"
    ? ["scrapling-worker.exe", "scrapling_worker.exe", "worker.exe"]
    : ["scrapling-worker", "scrapling_worker", "worker"];

function isInside(childPath, parentPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function resetStagingDir() {
  if (!isInside(stagingDir, desktopResourcesDir)) {
    throw new Error(`Refusing to reset staging dir outside .desktop-resources: ${stagingDir}`);
  }

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
}

function findUsableSourceDir() {
  return candidateSourceDirs.find((sourceDir) => {
    if (!sourceDir || !fs.existsSync(sourceDir)) return false;
    const stat = fs.statSync(sourceDir);
    return stat.isDirectory() && fs.readdirSync(sourceDir).length > 0;
  });
}

function findWorkerExecutable(dir) {
  for (const executableName of workerExecutableNames) {
    const executablePath = path.join(dir, executableName);
    if (fs.existsSync(executablePath) && fs.statSync(executablePath).isFile()) {
      return executableName;
    }
  }

  return null;
}

resetStagingDir();

const sourceDir = findUsableSourceDir();
let workerExecutable = null;

if (sourceDir) {
  fs.cpSync(sourceDir, stagingDir, { recursive: true, force: true });
  workerExecutable = findWorkerExecutable(stagingDir);
  console.log(`[scrapling-worker] Staged worker resources from ${path.relative(rootDir, sourceDir)}`);
} else {
  console.warn("[scrapling-worker] No worker build output found; packaging placeholder metadata only.");
}

const manifest = {
  resourceName: "scrapling-worker",
  sourceDir: sourceDir ? path.relative(rootDir, sourceDir) : null,
  workerExecutable,
  placeholder: !sourceDir,
};

fs.writeFileSync(path.join(stagingDir, "packaging-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
