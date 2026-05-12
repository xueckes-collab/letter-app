/**
 * Auth routes — Email + Password login/register + Gmail OAuth2 for email accounts
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

// ============================================================
// Validation helpers
// ============================================================
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COMMON_WEAK_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "abcdefgh", "aabbccdd",
  "11223344", "00000000", "88888888", "12341234", "abcd1234",
  "a1234567", "qwertyui", "qwerty123", "abc12345", "trustno1",
]);

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 320;
}

function validatePW(pw: string): { ok: boolean; error?: string } {
  if (pw.length < 8) return { ok: false, error: "密码长度至少 8 位" };
  if (pw.length > 128) return { ok: false, error: "密码长度不能超过 128 位" };
  if (COMMON_WEAK_PASSWORDS.has(pw.toLowerCase()))
    return { ok: false, error: "该密码过于常见，请换一个更安全的密码" };
  return { ok: true };
}

// ============================================================
// Login attempt rate limiter (in-memory)
// ============================================================
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(email: string): { allowed: boolean; retryAfterMs?: number } {
  const key = email.toLowerCase().trim();
  const record = loginAttempts.get(key);
  if (!record) return { allowed: true };
  if (record.lockedUntil > Date.now()) {
    return { allowed: false, retryAfterMs: record.lockedUntil - Date.now() };
  }
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCK_DURATION_MS;
    return { allowed: false, retryAfterMs: LOCK_DURATION_MS };
  }
  return { allowed: true };
}

function recordLoginFailure(email: string) {
  const key = email.toLowerCase().trim();
  const record = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCK_DURATION_MS;
  }
  loginAttempts.set(key, record);
}

function clearLoginFailures(email: string) {
  loginAttempts.delete(email.toLowerCase().trim());
}

// Clean up stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (record.lockedUntil < now && record.count > 0) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);

export function registerOAuthRoutes(app: Express) {
  const googleClient = ENV.googleClientId ? new OAuth2Client(ENV.googleClientId) : null;

  // GET /api/auth/health — debug endpoint (TEMPORARY)
  app.get("/api/auth/health", async (_req: Request, res: Response) => {
    const checks: Record<string, unknown> = { timestamp: new Date().toISOString() };
    checks.hasDbUrl = !!process.env.DATABASE_URL;
    checks.dbUrlPrefix = process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 15) + "..." : "NOT SET";
    checks.hasJwtSecret = !!ENV.cookieSecret;
    try {
      const testUser = await db.getUserByEmail("__health__@test.invalid");
      checks.dbConnected = true;
      checks.testResult = testUser === undefined ? "no user (ok)" : "found";
    } catch (e) {
      checks.dbConnected = false;
      checks.dbError = e instanceof Error ? e.message : String(e);
      checks.dbStack = e instanceof Error ? (e.stack || "").split("\n").slice(0, 4).join(" | ") : "";
    }
    res.json(checks);
  });

  // POST /api/auth/register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, name } = req.body ?? {};

    // 1. Required fields
    if (!email || !password) {
      res.status(400).json({ error: "邮箱和密码为必填项" });
      return;
    }

    // 2. Email format validation
    const normalizedEmail = email.toLowerCase().trim();
    if (!validateEmail(normalizedEmail)) {
      res.status(400).json({ error: "邮箱格式不正确" });
      return;
    }

    // 3. Name required
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      res.status(400).json({ error: "用户名为必填项" });
      return;
    }

    // 4. Strength check
    const pwCheck = validatePW(password);
    if (!pwCheck.ok) {
      res.status(400).json({ error: pwCheck.error });
      return;
    }

    try {
      const existing = await db.getUserByEmail(normalizedEmail);
      if (existing) {
        // Generic message to prevent user enumeration
        res.status(400).json({ error: "注册失败，请检查信息后重试" });
        return;
      }
      const pwHash = await bcrypt.hash(password, 10);
      const user = await db.createUser({
        email: normalizedEmail,
        passwordHash: pwHash,
        name: trimmedName,
      });
      const sToken = await sdk.createSessionToken(user.id, user.email!);
      const cookieOpts = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sToken, { ...cookieOpts, maxAge: ONE_YEAR_MS });
      res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
      console.error("[Auth] Register failed", error);
      const _m = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "注册失败，请稍后再试", debug: _m });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "邮箱和密码为必填项" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit check
    const rateCheck = checkLoginRateLimit(normalizedEmail);
    if (!rateCheck.allowed) {
      const minutes = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
      res.status(429).json({ error: `登录失败次数过多，请 ${minutes} 分钟后再试` });
      return;
    }

    try {
      const user = await db.getUserByEmail(normalizedEmail);
      if (!user || !user.passwordHash) {
        recordLoginFailure(normalizedEmail);
        res.status(401).json({ error: "邮箱或密码不正确" });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        recordLoginFailure(normalizedEmail);
        res.status(401).json({ error: "邮箱或密码不正确" });
        return;
      }

      // Success - clear rate limit
      clearLoginFailures(normalizedEmail);

      await db.updateUserLastSignedIn(user.id);
      const sToken = await sdk.createSessionToken(user.id, user.email!);
      const cookieOpts = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sToken, { ...cookieOpts, maxAge: ONE_YEAR_MS });
      res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
      console.error("[Auth] Login failed", error);
      const _m = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "登录失败，请稍后再试", debug: _m });
    }
  });

  // POST /api/auth/google
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    if (!googleClient) {
      res.status(503).json({ error: "Google login is not configured" });
      return;
    }

    const { credential } = req.body ?? {};
    if (!credential) {
      res.status(400).json({ error: "Missing credential" });
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

      const sToken = await sdk.createSessionToken(user.id, user.email!);
      const cookieOpts = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sToken, { ...cookieOpts, maxAge: ONE_YEAR_MS });
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
  // ============================================================
  app.get("/api/auth/gmail/connect", async (req: Request, res: Response) => {
    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.status(503).json({ error: "Gmail OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)" });
      return;
    }

    const accountIdStr = req.query.accountId as string | undefined;
    if (!accountIdStr) {
      res.status(400).send("Missing accountId");
      return;
    }
    const accountId = parseInt(accountIdStr, 10);
    if (isNaN(accountId)) {
      res.status(400).send("Invalid accountId");
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

    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/gmail/callback`;
    const oauthClient = new OAuth2Client(ENV.googleClientId, ENV.googleClientSecret, redirectUri);

    try {
      const { tokens } = await oauthClient.getToken(code);
      if (!tokens.access_token || !tokens.refresh_token) {
        res.status(400).send("Failed to get tokens from Google");
        return;
      }

      const account = await db.getEmailAccountById(accountId);
      if (!account) {
        res.status(404).send("Email account not found");
        return;
      }

      await db.updateEmailAccount(accountId, {
        gmailAccessToken: tokens.access_token,
        gmailRefreshToken: tokens.refresh_token,
        gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      });

      res.redirect("/settings/email-accounts?gmailConnected=true");
    } catch (err) {
      console.error("[Gmail OAuth] Token exchange failed", err);
      res.redirect(`/settings/email-accounts?gmailError=${encodeURIComponent("Token exchange failed")}`);
    }
  });
}
