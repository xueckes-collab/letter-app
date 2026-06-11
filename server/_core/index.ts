import "dotenv/config";
import express from "express";
import { createServer, type Server } from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";
import { startScheduler, stopScheduler } from "../services/scheduler";
import { seedAdminUser } from "../db";
import { resolveLocalFilePath } from "../storage";

export type StartServerOptions = {
  port?: number;
  host?: string;
  startJobs?: boolean;
  seedAdminEmail?: string | null;
};

export type StartedServer = {
  app: express.Express;
  server: Server;
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
};

function getListenUrl(host: string, port: number) {
  const browserHost = host === "0.0.0.0" ? "localhost" : host;
  return `http://${browserHost}:${port}/`;
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function listen(server: Server, port: number, host: string) {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ port, host });
  });

  const address = server.address();
  if (typeof address === "object" && address?.port) {
    return address.port;
  }
  return port;
}

export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "140mb" }));
  app.use(express.urlencoded({ limit: "140mb", extended: true }));

  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.get("/api/files/*", (req, res) => {
    try {
      const key = (req.params as Record<string, string>)[0];
      res.sendFile(resolveLocalFilePath(key));
    } catch (error) {
      res.status(404).json({ error: "File not found" });
    }
  });

  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = options.port ?? parseInt(process.env.PORT || "3000", 10);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const actualPort = await listen(server, port, host);
  const url = getListenUrl(host, actualPort);
  const shouldStartJobs = options.startJobs ?? true;

  console.log(`Server running on ${url}`);

  if (shouldStartJobs) {
    startScheduler();
  }

  const adminEmail = options.seedAdminEmail ?? process.env.ADMIN_EMAIL ?? null;
  if (adminEmail) {
    seedAdminUser(adminEmail).catch(console.error);
  }

  return {
    app,
    server,
    port: actualPort,
    host,
    url,
    close: async () => {
      stopScheduler();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

if (isDirectRun()) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
