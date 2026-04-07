import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

// ============================================================
// 1. USERS TABLE (scaffold default + extended)
// ============================================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// 2. SENDER PROFILES
// ============================================================
export const senderProfiles = mysqlTable("sender_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  website: varchar("website", { length: 500 }).default(""),
  mainProducts: text("mainProducts"),
  coreAdvantages: text("coreAdvantages"),
  certifications: text("certifications"),
  moqLeadTime: text("moqLeadTime"),
  samplePolicy: text("samplePolicy"),
  customization: text("customization"),
  onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SenderProfile = typeof senderProfiles.$inferSelect;
export type InsertSenderProfile = typeof senderProfiles.$inferInsert;

// ============================================================
// 3. SENDER ASSETS (uploaded files)
// ============================================================
export const senderAssets = mysqlTable("sender_assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  senderProfileId: int("senderProfileId").notNull(),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"),
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  extractedText: text("extractedText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SenderAsset = typeof senderAssets.$inferSelect;
export type InsertSenderAsset = typeof senderAssets.$inferInsert;

// ============================================================
// 4. LEADS
// ============================================================
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  website: varchar("website", { length: 500 }).notNull(),
  companyName: varchar("companyName", { length: 255 }),
  contactName: varchar("contactName", { length: 255 }),
  country: varchar("country", { length: 128 }),
  role: varchar("leadRole", { length: 128 }),
  linkedinUrl: varchar("linkedinUrl", { length: 500 }),
  importBatchId: varchar("importBatchId", { length: 64 }),
  source: varchar("source", { length: 64 }).default("manual").notNull(),
  status: varchar("status", { length: 64 }).default("new").notNull(),
  replyStatus: varchar("replyStatus", { length: 64 }).default("not_checked").notNull(),
  statusColor: varchar("statusColor", { length: 32 }).default("slate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// ============================================================
// 5. WEBSITE ANALYSES
// ============================================================
export const websiteAnalyses = mysqlTable("website_analyses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull().unique(),
  industry: varchar("industry", { length: 255 }),
  businessModel: varchar("businessModel", { length: 128 }),
  productFocus: text("productFocus"),
  marketPosition: text("marketPosition"),
  websiteSignals: json("websiteSignals"),
  purchaseIntentScore: int("purchaseIntentScore"),
  triggerEvents: json("triggerEvents"),
  rawSummary: text("rawSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebsiteAnalysis = typeof websiteAnalyses.$inferSelect;
export type InsertWebsiteAnalysis = typeof websiteAnalyses.$inferInsert;

// ============================================================
// 6. ICP MATCHES
// ============================================================
export const icpMatches = mysqlTable("icp_matches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull().unique(),
  icpName: varchar("icpName", { length: 255 }),
  buyerRoles: json("buyerRoles"),
  painPoints: json("painPoints"),
  triggers: json("triggers"),
  decisionStyle: text("decisionStyle"),
  salesAngles: json("salesAngles"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IcpMatch = typeof icpMatches.$inferSelect;
export type InsertIcpMatch = typeof icpMatches.$inferInsert;

// ============================================================
// 7. USP MATCHES
// ============================================================
export const uspMatches = mysqlTable("usp_matches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull().unique(),
  primaryUsp: text("primaryUsp"),
  secondaryUsp: text("secondaryUsp"),
  whyFit: text("whyFit"),
  proofPoints: json("proofPoints"),
  emailAngle: json("emailAngle"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UspMatch = typeof uspMatches.$inferSelect;
export type InsertUspMatch = typeof uspMatches.$inferInsert;

// ============================================================
// 8. EMAIL SEQUENCES
// ============================================================
export const emailSequences = mysqlTable("email_sequences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull(),
  emailType: varchar("emailType", { length: 64 }).notNull(),
  subject: text("subject"),
  body: text("body"),
  strategyType: varchar("strategyType", { length: 128 }),
  stageNumber: int("stageNumber").default(0).notNull(),
  ctaType: varchar("ctaType", { length: 128 }),
  version: varchar("version", { length: 64 }),
  thinkingSummary: json("thinkingSummary"),
  status: varchar("status", { length: 64 }).default("draft").notNull(),
  sentAt: timestamp("sentAt"),
  gmailMessageId: varchar("gmailMessageId", { length: 255 }),
  gmailThreadId: varchar("gmailThreadId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailSequence = typeof emailSequences.$inferSelect;
export type InsertEmailSequence = typeof emailSequences.$inferInsert;

// ============================================================
// 9. REPLY ANALYSES
// ============================================================
export const replyAnalyses = mysqlTable("reply_analyses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull(),
  originalReply: text("originalReply"),
  replyType: varchar("replyType", { length: 64 }),
  explicitNeeds: json("explicitNeeds"),
  hiddenConcerns: json("hiddenConcerns"),
  recommendedNextAction: text("recommendedNextAction"),
  thinkingSummary: json("thinkingSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReplyAnalysis = typeof replyAnalyses.$inferSelect;
export type InsertReplyAnalysis = typeof replyAnalyses.$inferInsert;

// ============================================================
// 10. LEAD STATES (workflow state machine)
// ============================================================
export const leadStates = mysqlTable("lead_states", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull().unique(),
  currentState: varchar("currentState", { length: 64 }).default("input_ready").notNull(),
  currentRound: int("currentRound").default(0).notNull(),
  lastEmailType: varchar("lastEmailType", { length: 64 }),
  hasReply: boolean("hasReply").default(false).notNull(),
  replyPastedAt: timestamp("replyPastedAt"),
  nextAction: text("nextAction"),
  nextCheckAt: timestamp("nextCheckAt"),
  lastReportNote: text("lastReportNote"),
  lastSentAt: timestamp("lastSentAt"),
  followUpDueAt: timestamp("followUpDueAt"),
  autoFollowUpEnabled: boolean("autoFollowUpEnabled").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================================
// 11. NOTIFICATIONS
// ============================================================
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId"),
  type: varchar("type", { length: 64 }).notNull(), // reply_detected, followup_due, batch_complete
  title: varchar("title", { length: 500 }).notNull(),
  message: text("message"),
  isRead: boolean("isRead").default(false).notNull(),
  actionUrl: varchar("actionUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export type LeadState = typeof leadStates.$inferSelect;
export type InsertLeadState = typeof leadStates.$inferInsert;

// ============================================================
// 12. EMAIL ACCOUNTS (SMTP / Snov.io configs)
// ============================================================
export const emailAccounts = mysqlTable("email_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(), // smtp, snovio, gmail
  label: varchar("label", { length: 255 }).notNull(), // user-friendly name
  email: varchar("email", { length: 320 }).notNull(), // sender email address
  smtpHost: varchar("smtpHost", { length: 255 }),
  smtpPort: int("smtpPort"),
  smtpUser: varchar("smtpUser", { length: 320 }),
  smtpPass: varchar("smtpPass", { length: 500 }),
  smtpSecure: boolean("smtpSecure").default(true).notNull(),
  imapHost: varchar("imapHost", { length: 255 }),
  imapPort: int("imapPort"),
  imapSecure: boolean("imapSecure").default(true).notNull(),
  snovioClientId: varchar("snovioClientId", { length: 255 }),
  snovioClientSecret: varchar("snovioClientSecret", { length: 255 }),
  isDefault: boolean("isDefault").default(false).notNull(),
  isVerified: boolean("isVerified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailAccount = typeof emailAccounts.$inferSelect;
export type InsertEmailAccount = typeof emailAccounts.$inferInsert;

// ============================================================
// 13. AUTOMATION SETTINGS (per-user preferences)
// ============================================================
export const automationSettings = mysqlTable("automation_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  followUpHours: int("followUpHours").default(48).notNull(),
  maxFollowUpRounds: int("maxFollowUpRounds").default(9).notNull(),
  autoFollowUpEnabled: boolean("autoFollowUpEnabled").default(true).notNull(),
  replyCheckEnabled: boolean("replyCheckEnabled").default(true).notNull(),
  notifyOnReply: boolean("notifyOnReply").default(true).notNull(),
  notifyOnFollowUpDue: boolean("notifyOnFollowUpDue").default(true).notNull(),
  sendDelaySeconds: int("sendDelaySeconds").default(5).notNull(), // delay between batch emails
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutomationSetting = typeof automationSettings.$inferSelect;
export type InsertAutomationSetting = typeof automationSettings.$inferInsert;
