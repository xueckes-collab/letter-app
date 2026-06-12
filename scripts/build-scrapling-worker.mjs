import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workerDir = path.join(root, "workers", "scrapling_worker");
const workerEntry = path.join(workerDir, "worker.py");
const requirements = path.join(workerDir, "requirements.txt");
const buildDir = path.join(root, "build", "scrapling-worker");
const venvDir = path.join(root, "build", "scrapling-worker-venv");
const browserRuntimeDir = path.join(buildDir, "browser-runtime");
const outputExe = path.join(buildDir, process.platform === "win32" ? "scrapling-worker.exe" : "scrapling-worker");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  return result.status === 0;
}

function pythonModuleAvailable(py, moduleName) {
  const result = spawnSync(py, [
    "-c",
    `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(moduleName)}) else 1)`,
  ], {
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
}

function pythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON;
  if (process.platform === "win32") return "python";
  return "python3";
}

function venvPython() {
  if (process.platform === "win32") return path.join(venvDir, "Scripts", "python.exe");
  return path.join(venvDir, "bin", "python");
}

if (process.env.SCRAPLING_WORKER_SKIP === "1") {
  console.log("[scrapling-worker] skipped because SCRAPLING_WORKER_SKIP=1");
  process.exit(0);
}

if (!fs.existsSync(workerEntry)) {
  throw new Error(`Missing worker entry: ${workerEntry}`);
}

fs.mkdirSync(buildDir, { recursive: true });

if (!fs.existsSync(venvPython())) {
  console.log("[scrapling-worker] creating Python virtual environment");
  run(pythonCommand(), ["-m", "venv", venvDir]);
}

const py = venvPython();
console.log("[scrapling-worker] installing Python dependencies");
run(py, ["-m", "pip", "install", "--upgrade", "pip"]);
run(py, ["-m", "pip", "install", "-r", requirements]);
run(py, ["-m", "pip", "install", "pyinstaller>=6.0.0"]);

const browserEnv = {
  ...process.env,
  PYTHONUTF8: "1",
  PLAYWRIGHT_BROWSERS_PATH: browserRuntimeDir,
};

if (process.env.SCRAPLING_SKIP_BROWSER_INSTALL === "1") {
  console.log("[scrapling-worker] browser runtime install skipped because SCRAPLING_SKIP_BROWSER_INSTALL=1");
} else {
  fs.mkdirSync(browserRuntimeDir, { recursive: true });
  console.log("[scrapling-worker] installing Scrapling browser runtime");
  const installedBrowsers = runOptional(py, [
    "-c",
    "from scrapling.cli import install; install([], standalone_mode=False)",
  ], { env: browserEnv });

  if (!installedBrowsers) {
    const message = "[scrapling-worker] browser runtime install failed; static Scrapling fetching will still be packaged";
    if (process.env.SCRAPLING_REQUIRE_BROWSER_INSTALL === "1") {
      throw new Error(message);
    }
    console.warn(message);
  }
}

console.log("[scrapling-worker] building executable");
const collectModules = [
  "scrapling",
  "curl_cffi",
  "playwright",
  "patchright",
  "browserforge",
  "apify_fingerprint_datapoints",
  "camoufox",
]
  .filter(moduleName => pythonModuleAvailable(py, moduleName));
const collectArgs = collectModules.flatMap(moduleName => ["--collect-all", moduleName]);

run(py, [
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name",
  "scrapling-worker",
  "--distpath",
  buildDir,
  "--workpath",
  path.join(root, "build", "scrapling-worker-pyinstaller"),
  "--specpath",
  path.join(root, "build", "scrapling-worker-pyinstaller"),
  ...collectArgs,
  workerEntry,
]);

if (!fs.existsSync(outputExe)) {
  throw new Error(`Expected worker executable was not created: ${outputExe}`);
}

console.log(`[scrapling-worker] ready: ${outputExe}`);
