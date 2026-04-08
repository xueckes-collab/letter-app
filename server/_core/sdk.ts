/**
 * Auth SDK - Self-hosted JWT session management
 * Replaces Manus OAuth SDK entirely.
 * Uses bcryptjs for password hashing and jose for JWT signing/verification.
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  userId: number;
  email: string;
};

class AuthService {
  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) throw new Error("JWT_SECRET is not configured");
    return new TextEncoder().encode(secret);
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  async createSessionToken(
    userId: number,
    email: string,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();
    return new SignJWT({ userId, email })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ userId: number; email: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { userId, email } = payload as Record<string, unknown>;
      if (typeof userId !== "number" || typeof email !== "string") {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return { userId, email };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const user = await db.getUserById(session.userId);
    if (!user) {
      throw ForbiddenError("User not found");
    }
    return user;
  }
}

export const sdk = new AuthService();
