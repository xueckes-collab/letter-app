import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

type DesktopConfig = {
  jwtSecret?: string;
  openaiApiKey?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  storageMode?: "local" | "s3";
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Bucket?: string;
  s3PublicUrl?: string;
};

type StartedServer = {
  url: string;
  close: () => Promise<void>;
};

type ScraplingWorkerPaths = {
  resourceDir: string;
  manifestPath: string;
  executablePath: string | null;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let startedServer: StartedServer | null = null;

function appRootDir() {
  return path.resolve(__dirname, "..");
}

function scraplingWorkerExecutableNames() {
  return process.platform === "win32"
    ? ["scrapling-worker.exe", "scrapling_worker.exe", "worker.exe"]
    : ["scrapling-worker", "scrapling_worker", "worker"];
}

function firstExistingDirectory(candidates: Array<string | null | undefined>) {
  return candidates.find((candidate) => {
    if (!candidate) return false;
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  });
}

function firstExistingFile(candidates: string[]) {
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function resolveScraplingWorkerPaths(): ScraplingWorkerPaths {
  const rootDir = appRootDir();
  const configuredResourceDir = process.env.SCRAPLING_WORKER_RESOURCE_DIR
    ? path.resolve(process.env.SCRAPLING_WORKER_RESOURCE_DIR)
    : null;

  const packagedResourceDir = path.join(process.resourcesPath, "scrapling-worker");
  const devResourceDir = firstExistingDirectory([
    configuredResourceDir,
    path.join(rootDir, ".desktop-resources", "scrapling-worker"),
    path.join(rootDir, "build", "scrapling-worker"),
    path.join(rootDir, "workers", "scrapling_worker", "dist"),
    path.join(rootDir, "workers", "scrapling-worker", "dist"),
    path.join(rootDir, "workers", "scrapling_worker", "build"),
    path.join(rootDir, "workers", "scrapling-worker", "build"),
  ]);

  const resourceDir = app.isPackaged
    ? configuredResourceDir ?? packagedResourceDir
    : devResourceDir ?? configuredResourceDir ?? path.join(rootDir, ".desktop-resources", "scrapling-worker");

  const configuredExecutablePath = process.env.SCRAPLING_WORKER_PATH
    ? path.resolve(process.env.SCRAPLING_WORKER_PATH)
    : null;
  const executablePath =
    configuredExecutablePath && fs.existsSync(configuredExecutablePath)
      ? configuredExecutablePath
      : firstExistingFile(scraplingWorkerExecutableNames().map((fileName) => path.join(resourceDir, fileName))) ?? null;

  return {
    resourceDir,
    manifestPath: path.join(resourceDir, "packaging-manifest.json"),
    executablePath,
  };
}

function applyScraplingWorkerEnv() {
  const workerPaths = resolveScraplingWorkerPaths();

  process.env.SCRAPLING_WORKER_RESOURCE_DIR ||= workerPaths.resourceDir;
  process.env.SCRAPLING_WORKER_MANIFEST_PATH ||= workerPaths.manifestPath;

  if (workerPaths.executablePath) {
    process.env.SCRAPLING_WORKER_PATH ||= workerPaths.executablePath;
  }
}

function readConfig(configPath: string): DesktopConfig {
  try {
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as DesktopConfig;
  } catch {
    return {};
  }
}

function writeConfig(configPath: string, config: DesktopConfig) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function encryptSecret(value: string) {
  if (!safeStorage.isEncryptionAvailable()) return `plain:${value}`;
  return `safe:${safeStorage.encryptString(value).toString("base64")}`;
}

function decryptSecret(value: string | undefined) {
  if (!value) return "";
  if (value.startsWith("safe:")) {
    if (!safeStorage.isEncryptionAvailable()) return "";
    return safeStorage.decryptString(Buffer.from(value.slice(5), "base64"));
  }
  if (value.startsWith("plain:")) return value.slice(6);
  return value;
}

function applyDesktopEnv(userDataPath: string) {
  const configPath = path.join(userDataPath, "desktop-config.json");
  const config = readConfig(configPath);

  if (!config.jwtSecret) {
    config.jwtSecret = encryptSecret(randomBytes(32).toString("base64url"));
    writeConfig(configPath, config);
  }

  process.env.NODE_ENV = "production";
  process.env.DESKTOP_MODE = "1";
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  process.env.LETTER_APP_DATA_DIR = userDataPath;
  process.env.STORAGE_MODE = config.storageMode ?? "local";
  process.env.JWT_SECRET ||= decryptSecret(config.jwtSecret);

  const optionalEnv: Array<[keyof DesktopConfig, string]> = [
    ["openaiApiKey", "OPENAI_API_KEY"],
    ["googleClientId", "GOOGLE_CLIENT_ID"],
    ["googleClientSecret", "GOOGLE_CLIENT_SECRET"],
    ["s3Endpoint", "S3_ENDPOINT"],
    ["s3AccessKeyId", "S3_ACCESS_KEY_ID"],
    ["s3SecretAccessKey", "S3_SECRET_ACCESS_KEY"],
    ["s3Bucket", "S3_BUCKET"],
    ["s3PublicUrl", "S3_PUBLIC_URL"],
  ];

  for (const [configKey, envKey] of optionalEnv) {
    const rawValue = config[configKey];
    if (typeof rawValue === "string" && rawValue) {
      process.env[envKey] ||= decryptSecret(rawValue);
    }
  }

  applyScraplingWorkerEnv();
}

async function startBackend() {
  const serverEntry = path.join(__dirname, "..", "dist", "index.js");
  const serverModule = await import(pathToFileURL(serverEntry).href);
  const startServer = serverModule.startServer as (options: {
    port: number;
    host: string;
    startJobs: boolean;
    seedAdminEmail: null;
  }) => Promise<StartedServer>;

  return startServer({
    port: 0,
    host: "127.0.0.1",
    startJobs: true,
    seedAdminEmail: null,
  });
}

async function createWindow() {
  const userDataPath = app.getPath("userData");
  applyDesktopEnv(userDataPath);
  startedServer = await startBackend();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: "Letter App",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!startedServer || url.startsWith(startedServer.url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  await mainWindow.loadURL(startedServer.url);
}

ipcMain.handle("desktop:get-info", () => {
  const userDataPath = app.getPath("userData");
  const scraplingWorkerPaths = resolveScraplingWorkerPaths();

  return {
    dataDir: userDataPath,
    dbPath: path.join(userDataPath, "letter.db"),
    uploadsDir: path.join(userDataPath, "uploads"),
    scraplingWorkerResourceDir: scraplingWorkerPaths.resourceDir,
    scraplingWorkerPath: scraplingWorkerPaths.executablePath,
    scraplingWorkerAvailable: Boolean(scraplingWorkerPaths.executablePath),
  };
});

app.whenReady().then(createWindow).catch((error) => {
  console.error("[Desktop] Failed to start", error);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", async (event) => {
  if (!startedServer) return;
  event.preventDefault();
  const server = startedServer;
  startedServer = null;
  await server.close().catch((error) => console.error("[Desktop] Failed to stop server", error));
  app.exit(0);
});
