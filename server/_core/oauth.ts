/**
 * Auth routes - Email + Password login/register + Gmail OAuth2 for email accounts
 * Replaces Manus OAuth callback entirely.
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import bcrypt from "bcryptjs";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

export function registerOAuthRoutes(app: Express) {
    const googleClient = ENV.googleClientId ? new OAuth2Client(ENV.googleClientId) : null;

  // POST /api/auth/register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
        const { email, password, name } = req.body ?? {};
        if (!email || !password) {
                res.status(400).json({ error: "email and password are required" });
                return;
        }
        if (password.length < 6) {
                res.status(400).json({ error: "password must be at least 6 characters" });
                return;
        }
        try {
                const existing = await db.getUserByEmail(email.toLowerCase().trim());
                if (existing) {
                          res.status(409).json({ error: "Email already registered" });
                          return;
                }
                const passwordHash = await bcrypt.hash(password, 10);
                const user = await db.createUser({
                          email: email.toLowerCase().trim(),
                          passwordHash,
                          name: name || email.split("@")[0],
                });
                const sessionToken = await sdk.createSessionToken(user.id, user.email!);
                const cookieOptions = getSessionCookieOptions(req);
                res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
                res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
        } catch (error) {
                console.error("[Auth] Register failed", error);
                res.status(500).json({ error: "Registration failed" });
        }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
        const { email, password } = req.body ?? {};
        if (!email || !password) {
                res.status(400).json({ error: "email and password are required" });
                return;
        }
        try {
                const user = await db.getUserByEmail(email.toLowerCase().trim());
                if (!user || !user.passwordHash) {
                          res.status(401).json({ error: "Invalid email or password" });
                          return;
                }
                const valid = await bcrypt.compare(password, user.passwordHash);
                if (!valid) {
                          res.status(401).json({ error: "Invalid email or password" });
                          return;
                }
                await db.updateUserLastSignedIn(user.id);
                const sessionToken = await sdk.createSessionToken(user.id, user.email!);
                const cookieOptions = getSessionCookieOptions(req);
                res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
                res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
        } catch (error) {
                console.error("[Auth] Login failed", error);
                res.status(500).json({ error: "Login failed" });
        }
  });

  // POST /api/auth/google
  app.post("/api/auth/google", async (req: Request, res: Response) => {
        if (!googleClient) {
                res.status(503).json({ error: "Google login is not configured" });
                return;
        }

               const { credential } = req.body ?? {};
        if (!credential || typeof credential !== "string") {
                res.status(400).json({ error: "credential is required" });
                return;
        }

               try {
                       const ticket = await googleClient.verifyIdToken({
                                 idToken: credential,
                                 audience: ENV.googleClientId,
                       });
                       const payload = ticket.getPayload();
                       if (!payload?.sub || !payload.email) {
                                 res.status(400).json({ error: "Invalid Google token" });
                                 return;
                       }

          const user = await db.createOrUpdateGoogleUser({
                    openId: payload.sub,
                    email: payload.email.toLowerCase().trim(),
                    name: payload.name || payload.given_name || payload.email.split("@")[0],
          });

          const sessionToken = await sdk.createSessionToken(user.id, user.email!);
                       const cookieOptions = getSessionCookieOptions(req);
                       res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
                       res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
               } catch (error) {
                       console.error("[Auth] Google login failed", error);
                       res.status(401).json({ error: "Google login failed" });
               }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
        res.clearCookie(COOKIE_NAME);
        res.json({ ok: true });
  });

  // ============================================================
  // Gmail OAuth2 for email accounts (IMAP reply detection)
  // GET /api/auth/gmail/connect?accountId=<id>
  // Redirects user to Google consent screen to grant Gmail access.
  // ============================================================
  app.get("/api/auth/gmail/connect", async (req: Request, res: Response) => {
        if (!ENV.googleClientId || !ENV.googleClientSecret) {
                res.status(503).json({ error: "Gmail OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)" });
                return;
        }

              const accountId = req.query.accountId as string | undefined;
        if (!accountId) {
                res.status(400).json({ error: "accountId query param is required" });
                return;
        }

              const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/gmail/callback`;

              const oauthClient = new OAuth2Client(ENV.googleClientId, ENV.googleClientSecret, redirectUri);

              const authUrl = oauthClient.generateAuthUrl({
                      access_type: "offline",
                      prompt: "consent",
                      scope: [
                                "https://www.googleapis.com/auth/gmail.readonly",
                                "openid",
                                "email",
                              ],
                      state: accountId,
              });

              res.redirect(authUrl);
  });

  // ============================================================
  // GET /api/auth/gmail/callback
  // Google redirects here with ?code=...&state=<accountId>
  // Exchanges code for tokens, saves to emailAccounts table.
  // ============================================================
  app.get("/api/auth/gmail/callback", async (req: Request, res: Response) => {
        const code = req.query.code as string | undefined;
        const accountIdStr = req.query.state as string | undefined;
        const error = req.query.error as string | undefined;

              if (error) {
                      console.warn("[Gmail OAuth] User denied access:", error);
                      res.redirect(`/settings/email-accounts?gmailError=${encodeURIComponent(error)}`);
                      return;
              }

              if (!code || !accountIdStr) {
                      res.status(400).send("Missing code or state parameter");
                      return;
              }

              const accountId = parseInt(accountIdStr, 10);
        if (isNaN(accountId)) {
                res.status(400).send("Invalid accountId in state");
                return;
        }

              if (!ENV.googleClientId || !ENV.googleClientSecret) {
                      res.status(503).send("Gmail OAuth is not configured");
                      return;
              }

              try {
                      const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/gmail/callback`;
                      const oauthClient = new OAuth2Client(ENV.googleClientId, ENV.googleClientSecret, redirectUri);

          // Exchange authorization code for tokens
          const { tokens } = await oauthClient.getToken(code);

          if (!tokens.access_token || !tokens.refresh_token) {
                    console.error("[Gmail OAuth] Missing tokens in response:", Object.keys(tokens));
                    res.redirect(`/settings/email-accounts?gmailError=missing_tokens`);
                    return;
          }

          const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000);

          // Persist tokens to the emailAccounts record
          const dbConn = await db.getDb();
                      if (!dbConn) {
                                res.status(503).send("Database not available");
                                return;
                      }

          const { emailAccounts } = await import("../../drizzle/schema");
                      const { eq } = await import("drizzle-orm");

          await dbConn
                        .update(emailAccounts)
                        .set({
                                    gmailAccessToken: tokens.access_token,
                                    gmailRefreshToken: tokens.refresh_token,
                                    gmailTokenExpiry: expiryDate,
                                    isVerified: true,
                        })
                        .where(eq(emailAccounts.id, accountId));

          console.log(`[Gmail OAuth] Tokens saved for emailAccount #${accountId}`);

          // Redirect back to settings with success indicator
          res.redirect(`/settings/email-accounts?gmailSuccess=${accountId}`);
              } catch (err: any) {
                      console.error("[Gmail OAuth] Callback error:", err.message);
                      res.redirect(`/settings/email-accounts?gmailError=${encodeURIComponent(err.message || "unknown_error")}`);
              }
  });
}
