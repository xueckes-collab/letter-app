─────────────────/**
 * Auth routes - Email + Password login/register
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
}
