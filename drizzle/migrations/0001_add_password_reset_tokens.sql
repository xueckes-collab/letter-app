-- Migration: Add password_reset_tokens table
-- This table stores temporary tokens for the forgot-password flow.
-- Each token is valid for 1 hour and can only be used once.

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "token" VARCHAR(128) NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_token" ON "password_reset_tokens" ("token");

-- Index for cleanup of expired/used tokens
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_userId" ON "password_reset_tokens" ("userId");
