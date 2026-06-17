import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startScheduler } from "../services/scheduler";
import { ensureLeadResearchColumns, seedAdminUser } from "../db";

async function startServer() {
    await ensureLeadResearchColumns();

    const app = express();
    const server = createServer(app);

  // Configure body parser with larger size limit for 100MB file uploads (base64 overhead included)
  app.use(express.json({ limit: "140mb" }));
    app.use(express.urlencoded({ limit: "140mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // tRPC API
  app.use(
        "/api/trpc",
        createExpressMiddleware({
                router: appRouter,
                createContext,
        })
      );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
        await setupVite(app, server);
  } else {
        serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");
    server.listen(port, "0.0.0.0", () => {
          console.log(`Server running on http://localhost:${port}/`);
          // Start background scheduler for follow-up detection and reply checking
                      startScheduler();
          // Set admin role for the designated admin email
                      seedAdminUser('xueckes@gmail.com').catch(console.error);
    });
}

startServer().catch(console.error);
