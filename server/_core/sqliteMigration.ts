import type Database from "better-sqlite3";

const statements = [
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "openId" TEXT,
    "name" TEXT,
    "email" TEXT UNIQUE,
    "passwordHash" TEXT,
    "loginMethod" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    "lastSignedIn" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "sender_profiles" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "website" TEXT DEFAULT '',
    "mainProducts" TEXT,
    "coreAdvantages" TEXT,
    "certifications" TEXT,
    "moqLeadTime" TEXT,
    "samplePolicy" TEXT,
    "customization" TEXT,
    "onboardingComplete" INTEGER NOT NULL DEFAULT 0,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    "emailSignature" TEXT,
    "emailFontSize" INTEGER DEFAULT 14,
    "emailFontFamily" TEXT DEFAULT 'Arial, sans-serif',
    "signatureLogoUrl" TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS "sender_assets" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "senderProfileId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "fileUrl" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "extractedText" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "leads" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "companyName" TEXT,
    "contactName" TEXT,
    "country" TEXT,
    "leadRole" TEXT,
    "linkedinUrl" TEXT,
    "importBatchId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'new',
    "replyStatus" TEXT NOT NULL DEFAULT 'not_checked',
    "statusColor" TEXT NOT NULL DEFAULT 'slate',
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "website_analyses" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL UNIQUE,
    "industry" TEXT,
    "businessModel" TEXT,
    "productFocus" TEXT,
    "marketPosition" TEXT,
    "websiteSignals" TEXT,
    "purchaseIntentScore" INTEGER,
    "triggerEvents" TEXT,
    "rawSummary" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "icp_matches" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL UNIQUE,
    "icpName" TEXT,
    "buyerRoles" TEXT,
    "painPoints" TEXT,
    "triggers" TEXT,
    "decisionStyle" TEXT,
    "salesAngles" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "usp_matches" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL UNIQUE,
    "primaryUsp" TEXT,
    "secondaryUsp" TEXT,
    "whyFit" TEXT,
    "proofPoints" TEXT,
    "emailAngle" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "email_sequences" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "emailType" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "strategyType" TEXT,
    "stageNumber" INTEGER NOT NULL DEFAULT 0,
    "ctaType" TEXT,
    "version" TEXT,
    "thinkingSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" INTEGER,
    "openedAt" INTEGER,
    "openCount" INTEGER DEFAULT 0,
    "gmailMessageId" TEXT,
    "gmailThreadId" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "reply_analyses" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "originalReply" TEXT,
    "replyType" TEXT,
    "explicitNeeds" TEXT,
    "hiddenConcerns" TEXT,
    "recommendedNextAction" TEXT,
    "thinkingSummary" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "lead_states" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL UNIQUE,
    "currentState" TEXT NOT NULL DEFAULT 'input_ready',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "lastEmailType" TEXT,
    "hasReply" INTEGER NOT NULL DEFAULT 0,
    "replyPastedAt" INTEGER,
    "nextAction" TEXT,
    "nextCheckAt" INTEGER,
    "lastReportNote" TEXT,
    "lastSentAt" INTEGER,
    "followUpDueAt" INTEGER,
    "autoFollowUpEnabled" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "notifications" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "isRead" INTEGER NOT NULL DEFAULT 0,
    "actionUrl" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "email_accounts" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpSecure" INTEGER NOT NULL DEFAULT 1,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapSecure" INTEGER NOT NULL DEFAULT 1,
    "snovioClientId" TEXT,
    "snovioClientSecret" TEXT,
    "gmailAccessToken" TEXT,
    "gmailRefreshToken" TEXT,
    "gmailTokenExpiry" INTEGER,
    "isDefault" INTEGER NOT NULL DEFAULT 0,
    "isVerified" INTEGER NOT NULL DEFAULT 0,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "automation_settings" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL UNIQUE,
    "followUpHours" INTEGER NOT NULL DEFAULT 48,
    "maxFollowUpRounds" INTEGER NOT NULL DEFAULT 9,
    "autoFollowUpEnabled" INTEGER NOT NULL DEFAULT 1,
    "replyCheckEnabled" INTEGER NOT NULL DEFAULT 1,
    "notifyOnReply" INTEGER NOT NULL DEFAULT 1,
    "notifyOnFollowUpDue" INTEGER NOT NULL DEFAULT 1,
    "sendDelaySeconds" INTEGER NOT NULL DEFAULT 5,
    "autoSendFollowUp" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "feedbacks" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "aiAnalysis" TEXT,
    "aiScore" INTEGER,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "ai_prompt_settings" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "promptKey" TEXT NOT NULL UNIQUE,
    "promptText" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "auth_logs" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "email" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "errorMessage" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "expiresAt" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_leads_userId" ON "leads" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "idx_email_sequences_leadId" ON "email_sequences" ("leadId")`,
  `CREATE INDEX IF NOT EXISTS "idx_email_accounts_userId" ON "email_accounts" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "idx_notifications_userId" ON "notifications" ("userId")`,
];

export function runSqliteMigrations(database: Database.Database) {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  const migrate = database.transaction(() => {
    for (const statement of statements) {
      database.exec(statement);
    }
    addColumnIfMissing(database, "email_sequences", "openedAt", `"openedAt" INTEGER`);
    addColumnIfMissing(database, "email_sequences", "openCount", `"openCount" INTEGER DEFAULT 0`);
  });
  migrate();
}

function addColumnIfMissing(
  database: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const columns = database.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  database.exec(`ALTER TABLE "${tableName}" ADD COLUMN ${columnDefinition}`);
}
