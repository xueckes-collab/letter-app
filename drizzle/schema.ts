import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const id = () => integer("id").primaryKey({ autoIncrement: true });
const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull();
const nullableTimestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" });
const booleanColumn = (name: string, defaultValue: boolean) =>
  integer(name, { mode: "boolean" }).default(defaultValue).notNull();
const jsonColumn = <T = unknown>(name: string) => text(name, { mode: "json" }).$type<T>();

// ============================================================
// 1. USERS TABLE (scaffold default + extended)
// ============================================================
export const users = sqliteTable("users", {
  id: id(),
  openId: text("openId", { length: 64 }),
  name: text("name"),
  email: text("email", { length: 320 }).unique(),
  passwordHash: text("passwordHash", { length: 255 }),
  loginMethod: text("loginMethod", { length: 64 }),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// 2. SENDER PROFILES
// ============================================================
export const senderProfiles = sqliteTable("sender_profiles", {
  id: id(),
  userId: integer("userId").notNull(),
  companyName: text("companyName", { length: 255 }).notNull(),
  website: text("website", { length: 500 }).default(""),
  mainProducts: text("mainProducts"),
  coreAdvantages: text("coreAdvantages"),
  certifications: text("certifications"),
  moqLeadTime: text("moqLeadTime"),
  samplePolicy: text("samplePolicy"),
  customization: text("customization"),
  onboardingComplete: booleanColumn("onboardingComplete", false),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  emailSignature: text("emailSignature"),
  emailFontSize: integer("emailFontSize").default(14),
  emailFontFamily: text("emailFontFamily", { length: 100 }).default("Arial, sans-serif"),
  signatureLogoUrl: text("signatureLogoUrl"),
});

export type SenderProfile = typeof senderProfiles.$inferSelect;
export type InsertSenderProfile = typeof senderProfiles.$inferInsert;

// ============================================================
// 3. SENDER ASSETS (uploaded files)
// ============================================================
export const senderAssets = sqliteTable("sender_assets", {
  id: id(),
  userId: integer("userId").notNull(),
  senderProfileId: integer("senderProfileId").notNull(),
  fileName: text("fileName", { length: 500 }).notNull(),
  mimeType: text("mimeType", { length: 128 }),
  fileSize: integer("fileSize"),
  fileUrl: text("fileUrl", { length: 1000 }).notNull(),
  fileKey: text("fileKey", { length: 500 }).notNull(),
  extractedText: text("extractedText"),
  createdAt: timestamp("createdAt"),
});

export type SenderAsset = typeof senderAssets.$inferSelect;
export type InsertSenderAsset = typeof senderAssets.$inferInsert;

// ============================================================
// 4. LEADS
// ============================================================
export const leads = sqliteTable("leads", {
  id: id(),
  userId: integer("userId").notNull(),
  email: text("email", { length: 320 }).notNull(),
  website: text("website", { length: 500 }).notNull(),
  companyName: text("companyName", { length: 255 }),
  contactName: text("contactName", { length: 255 }),
  country: text("country", { length: 128 }),
  role: text("leadRole", { length: 128 }),
  linkedinUrl: text("linkedinUrl", { length: 500 }),
  importBatchId: text("importBatchId", { length: 64 }),
  source: text("source", { length: 64 }).default("manual").notNull(),
  status: text("status", { length: 64 }).default("new").notNull(),
  replyStatus: text("replyStatus", { length: 64 }).default("not_checked").notNull(),
  statusColor: text("statusColor", { length: 32 }).default("slate").notNull(),
  createdAt: timestamp("createdAt"),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// ============================================================
// 5. WEBSITE ANALYSES
// ============================================================
export const websiteAnalyses = sqliteTable("website_analyses", {
  id: id(),
  userId: integer("userId").notNull(),
  leadId: integer("leadId").notNull().unique(),
  industry: text("industry"),
  businessModel: text("businessModel"),
  productFocus: text("productFocus"),
  marketPosition: text("marketPosition"),
  websiteSignals: jsonColumn("websiteSignals"),
  purchaseIntentScore: integer("purchaseIntentScore"),
  triggerEvents: jsonColumn("triggerEvents"),
  rawSummary: text("rawSummary"),
  createdAt: timestamp("createdAt"),
});

export type WebsiteAnalysis = typeof websiteAnalyses.$inferSelect;
export type InsertWebsiteAnalysis = typeof websiteAnalyses.$inferInsert;

// ============================================================
// 6. ICP MATCHES
// ============================================================
export const icpMatches = sqliteTable("icp_matches", {
  id: id(),
  userId: integer("userId").notNull(),
  leadId: integer("leadId").notNull().unique(),
  icpName: text("icpName", { length: 255 }),
  buyerRoles: jsonColumn("buyerRoles"),
  painPoints: jsonColumn<string[]>("painPoints"),
  triggers: jsonColumn("triggers"),
  decisionStyle: text("decisionStyle"),
  salesAngles: jsonColumn("salesAngles"),
  createdAt: timestamp("createdAt"),
});

export type IcpMatch = typeof icpMatches.$inferSelect;
export type InsertIcpMatch = typeof icpMatches.$inferInsert;

// ============================================================
// 7. USP MATCHES
// ============================================================
export const uspMatches = sqliteTable("usp_matches", {
  id: id(),
  userId: integer("userId").notNull(),
  leadId: integer("leadId").notNull().unique(),
  primaryUsp: text("primaryUsp"),
  secondaryUsp: text("secondaryUsp"),
  whyFit: text("whyFit"),
  proofPoints: jsonColumn("proofPoints"),
  emailAngle: jsonColumn("emailAngle"),
  createdAt: timestamp("createdAt"),
});

export type UspMatch = typeof uspMatches.$inferSelect;
export type InsertUspMatch = typeof uspMatches.$inferInsert;

// ============================================================
// 8. EMAIL SEQUENCES
// ============================================================
export const emailSequences = sqliteTable("email_sequences", {
  id: id(),
  userId: integer("userId").notNull(),
  leadId: integer("leadId").notNull(),
  emailType: text("emailType", { length: 64 }).notNull(),
  subject: text("subject"),
  body: text("body"),
  strategyType: text("strategyType", { length: 128 }),
  stageNumber: integer("stageNumber").default(0).notNull(),
  ctaType: text("ctaType", { length: 128 }),
  version: text("version", { length: 64 }),
  thinkingSummary: jsonColumn("thinkingSummary"),
  status: text("status", { length: 64 }).default("draft").notNull(),
  sentAt: nullableTimestamp("sentAt"),
  openedAt: nullableTimestamp("openedAt"),
  openCount: integer("openCount").default(0),
  gmailMessageId: text("gmailMessageId", { length: 255 }),
  gmailThreadId: text("gmailThreadId", { length: 255 }),
  createdAt: timestamp("createdAt"),
});

export type EmailSequence = typeof emailSequences.$inferSelect;
export type InsertEmailSequence = typeof emailSequences.$inferInsert;

// ============================================================
// 9. REPLY ANALYSES
// ============================================================
export const replyAnalyses = sqliteTable("reply_analyses", {
  id: id(),
  userId: integer("userId").notNull(),
  leadId: integer("leadId").notNull(),
  originalReply: text("originalReply"),
  replyType: text("replyType", { length: 64 }),
  explicitNeeds: jsonColumn("explicitNeeds"),
  hiddenConcerns: jsonColumn("hiddenConcerns"),
  recommendedNextAction: text("recommendedNextAction"),
  thinkingSummary: jsonColumn("thinkingSummary"),
  createdAt: timestamp("createdAt"),
});

export type ReplyAnalysis = typeof replyAnalyses.$inferSelect;
export type InsertReplyAnalysis = typeof replyAnalyses.$inferInsert;

// ============================================================
// 10. LEAD STATES (workflow state machine)
// ============================================================
export const leadStates = sqliteTable("lead_states", {
  id: id(),
  userId: integer("userId").notNull(),
  leadId: integer("leadId").notNull().unique(),
  currentState: text("currentState", { length: 64 }).default("input_ready").notNull(),
  currentRound: integer("currentRound").default(0).notNull(),
  lastEmailType: text("lastEmailType", { length: 64 }),
  hasReply: booleanColumn("hasReply", false),
  replyPastedAt: nullableTimestamp("replyPastedAt"),
  nextAction: text("nextAction"),
  nextCheckAt: nullableTimestamp("nextCheckAt"),
  lastReportNote: text("lastReportNote"),
  lastSentAt: nullableTimestamp("lastSentAt"),
  followUpDueAt: nullableTimestamp("followUpDueAt"),
  autoFollowUpEnabled: booleanColumn("autoFollowUpEnabled", true),
  updatedAt: timestamp("updatedAt"),
});

export type LeadState = typeof leadStates.$inferSelect;
export type InsertLeadState = typeof leadStates.$inferInsert;

// ============================================================
// 11. NOTIFICATIONS
// ============================================================
export const notifications = sqliteTable("notifications", {
  id: id(),
  userId: integer("userId").notNull(),
  leadId: integer("leadId"),
  type: text("type", { length: 64 }).notNull(),
  title: text("title", { length: 500 }).notNull(),
  message: text("message"),
  isRead: booleanColumn("isRead", false),
  actionUrl: text("actionUrl", { length: 500 }),
  createdAt: timestamp("createdAt"),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ============================================================
// 12. EMAIL ACCOUNTS (SMTP / Gmail / Snov.io configs)
// ============================================================
export const emailAccounts = sqliteTable("email_accounts", {
  id: id(),
  userId: integer("userId").notNull(),
  provider: text("provider", { length: 64 }).notNull(),
  label: text("label", { length: 255 }).notNull(),
  email: text("email", { length: 320 }).notNull(),
  smtpHost: text("smtpHost", { length: 255 }),
  smtpPort: integer("smtpPort"),
  smtpUser: text("smtpUser", { length: 320 }),
  smtpPass: text("smtpPass", { length: 500 }),
  smtpSecure: booleanColumn("smtpSecure", true),
  imapHost: text("imapHost", { length: 255 }),
  imapPort: integer("imapPort"),
  imapSecure: booleanColumn("imapSecure", true),
  snovioClientId: text("snovioClientId", { length: 255 }),
  snovioClientSecret: text("snovioClientSecret", { length: 255 }),
  gmailAccessToken: text("gmailAccessToken"),
  gmailRefreshToken: text("gmailRefreshToken"),
  gmailTokenExpiry: nullableTimestamp("gmailTokenExpiry"),
  isDefault: booleanColumn("isDefault", false),
  isVerified: booleanColumn("isVerified", false),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type EmailAccount = typeof emailAccounts.$inferSelect;
export type InsertEmailAccount = typeof emailAccounts.$inferInsert;

// ============================================================
// 13. AUTOMATION SETTINGS (per-user preferences)
// ============================================================
export const automationSettings = sqliteTable("automation_settings", {
  id: id(),
  userId: integer("userId").notNull().unique(),
  followUpHours: integer("followUpHours").default(48).notNull(),
  maxFollowUpRounds: integer("maxFollowUpRounds").default(9).notNull(),
  autoFollowUpEnabled: booleanColumn("autoFollowUpEnabled", true),
  replyCheckEnabled: booleanColumn("replyCheckEnabled", true),
  notifyOnReply: booleanColumn("notifyOnReply", true),
  notifyOnFollowUpDue: booleanColumn("notifyOnFollowUpDue", true),
  sendDelaySeconds: integer("sendDelaySeconds").default(5).notNull(),
  autoSendFollowUp: booleanColumn("autoSendFollowUp", false),
  updatedAt: timestamp("updatedAt"),
});

export type AutomationSetting = typeof automationSettings.$inferSelect;
export type InsertAutomationSetting = typeof automationSettings.$inferInsert;

// ============================================================
// 14. USER FEEDBACKS
// ============================================================
export const feedbacks = sqliteTable("feedbacks", {
  id: id(),
  userId: integer("userId").notNull(),
  rating: integer("rating").notNull(),
  content: text("content").notNull(),
  category: text("category", { length: 64 }).default("general"),
  status: text("status", { enum: ["pending", "analyzed", "valuable", "archived"] }).default("pending").notNull(),
  aiAnalysis: text("aiAnalysis"),
  aiScore: integer("aiScore"),
  createdAt: timestamp("createdAt"),
});

export type Feedback = typeof feedbacks.$inferSelect;
export type InsertFeedback = typeof feedbacks.$inferInsert;

// AI Prompt Settings - Admin configurable prompts for email generation
export const aiPromptSettings = sqliteTable("ai_prompt_settings", {
  id: id(),
  promptKey: text("promptKey", { length: 100 }).notNull().unique(),
  promptText: text("promptText").notNull(),
  description: text("description", { length: 500 }),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type AiPromptSetting = typeof aiPromptSettings.$inferSelect;
export type NewAiPromptSetting = typeof aiPromptSettings.$inferInsert;

// ============================================================
// 15. AUTH LOGS
// ============================================================
export const authLogs = sqliteTable("auth_logs", {
  id: id(),
  userId: integer("userId"),
  email: text("email", { length: 320 }).notNull(),
  eventType: text("eventType", {
    enum: ["register_success", "register_fail", "login_success", "login_fail"],
  }).notNull(),
  errorMessage: text("errorMessage", { length: 500 }),
  ipAddress: text("ipAddress", { length: 64 }),
  userAgent: text("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt"),
});

export type AuthLog = typeof authLogs.$inferSelect;
export type InsertAuthLog = typeof authLogs.$inferInsert;

// ============================================================
// 16. PASSWORD RESET TOKENS
// ============================================================
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: id(),
  userId: integer("userId").notNull(),
  token: text("token", { length: 128 }).notNull().unique(),
  expiresAt: nullableTimestamp("expiresAt").notNull(),
  used: booleanColumn("used", false),
  createdAt: timestamp("createdAt"),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
