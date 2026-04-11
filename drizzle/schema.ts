import { integer, pgEnum, pgTable, serial, text, timestamp, varchar, boolean, json } from "drizzle-orm/pg-core";

// ============================================================
// ENUMS
// ============================================================
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["pending", "analyzed", "valuable", "archived"]);
export const authEventTypeEnum = pgEnum("auth_event_type", ["register_success", "register_fail", "login_success", "login_fail"]);

// ============================================================
// 1. USERS TABLE (scaffold default + extended)
// ============================================================
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    openId: varchar("openId", { length: 64 }), // legacy field, kept for migration compatibility
    name: text("name"),
    email: varchar("email", { length: 320 }).unique(),
    passwordHash: varchar("passwordHash", { length: 255 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: roleEnum("role").default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// 2. SENDER PROFILES
// ============================================================
export const senderProfiles = pgTable("sender_profiles", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    emailSignature: text("emailSignature"),
    emailFontSize: integer("emailFontSize").default(14),
    emailFontFamily: varchar("emailFontFamily", { length: 100 }).default("Arial, sans-serif"),
    signatureLogoUrl: text("signatureLogoUrl"),
});

export type SenderProfile = typeof senderProfiles.$inferSelect;
export type InsertSenderProfile = typeof senderProfiles.$inferInsert;

// ============================================================
// 3. SENDER ASSETS (uploaded files)
// ============================================================
export const senderAssets = pgTable("sender_assets", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    senderProfileId: integer("senderProfileId").notNull(),
    fileName: varchar("fileName", { length: 500 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }),
    fileSize: integer("fileSize"),
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
export const leads = pgTable("leads", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
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
export const websiteAnalyses = pgTable("website_analyses", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    leadId: integer("leadId").notNull().unique(),
    industry: varchar("industry", { length: 255 }),
    businessModel: varchar("businessModel", { length: 128 }),
    productFocus: text("productFocus"),
    marketPosition: text("marketPosition"),
    websiteSignals: json("websiteSignals"),
    purchaseIntentScore: integer("purchaseIntentScore"),
    triggerEvents: json("triggerEvents"),
    rawSummary: text("rawSummary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebsiteAnalysis = typeof websiteAnalyses.$inferSelect;
export type InsertWebsiteAnalysis = typeof websiteAnalyses.$inferInsert;

// ============================================================
// 6. ICP MATCHES
// ============================================================
export const icpMatches = pgTable("icp_matches", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    leadId: integer("leadId").notNull().unique(),
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
export const uspMatches = pgTable("usp_matches", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    leadId: integer("leadId").notNull().unique(),
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
export const emailSequences = pgTable("email_sequences", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    leadId: integer("leadId").notNull(),
    emailType: varchar("emailType", { length: 64 }).notNull(),
    subject: text("subject"),
    body: text("body"),
    strategyType: varchar("strategyType", { length: 128 }),
    stageNumber: integer("stageNumber").default(0).notNull(),
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
export const replyAnalyses = pgTable("reply_analyses", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    leadId: integer("leadId").notNull(),
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
export const leadStates = pgTable("lead_states", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    leadId: integer("leadId").notNull().unique(),
    currentState: varchar("currentState", { length: 64 }).default("input_ready").notNull(),
    currentRound: integer("currentRound").default(0).notNull(),
    lastEmailType: varchar("lastEmailType", { length: 64 }),
    hasReply: boolean("hasReply").default(false).notNull(),
    replyPastedAt: timestamp("replyPastedAt"),
    nextAction: text("nextAction"),
    nextCheckAt: timestamp("nextCheckAt"),
    lastReportNote: text("lastReportNote"),
    lastSentAt: timestamp("lastSentAt"),
    followUpDueAt: timestamp("followUpDueAt"),
    autoFollowUpEnabled: boolean("autoFollowUpEnabled").default(true).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ============================================================
// 11. NOTIFICATIONS
// ============================================================
export const notifications = pgTable("notifications", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    leadId: integer("leadId"),
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
// 12. EMAIL ACCOUNTS (SMTP / Gmail / Snov.io configs)
// ============================================================
export const emailAccounts = pgTable("email_accounts", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(), // smtp, snovio, gmail
    label: varchar("label", { length: 255 }).notNull(), // user-friendly name
    email: varchar("email", { length: 320 }).notNull(), // sender email address
    smtpHost: varchar("smtpHost", { length: 255 }),
    smtpPort: integer("smtpPort"),
    smtpUser: varchar("smtpUser", { length: 320 }),
    smtpPass: varchar("smtpPass", { length: 500 }),
    smtpSecure: boolean("smtpSecure").default(true).notNull(),
    imapHost: varchar("imapHost", { length: 255 }),
    imapPort: integer("imapPort"),
    imapSecure: boolean("imapSecure").default(true).notNull(),
    snovioClientId: varchar("snovioClientId", { length: 255 }),
    snovioClientSecret: varchar("snovioClientSecret", { length: 255 }),
    // Gmail OAuth2 tokens for IMAP reply detection (every 15 min polling)
    gmailAccessToken: text("gmailAccessToken"),
    gmailRefreshToken: text("gmailRefreshToken"),
    gmailTokenExpiry: timestamp("gmailTokenExpiry"),
    isDefault: boolean("isDefault").default(false).notNull(),
    isVerified: boolean("isVerified").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type EmailAccount = typeof emailAccounts.$inferSelect;
export type InsertEmailAccount = typeof emailAccounts.$inferInsert;

// ============================================================
// 13. AUTOMATION SETTINGS (per-user preferences)
// ============================================================
export const automationSettings = pgTable("automation_settings", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().unique(),
    followUpHours: integer("followUpHours").default(48).notNull(),
    maxFollowUpRounds: integer("maxFollowUpRounds").default(9).notNull(),
    autoFollowUpEnabled: boolean("autoFollowUpEnabled").default(true).notNull(),
    replyCheckEnabled: boolean("replyCheckEnabled").default(true).notNull(),
    notifyOnReply: boolean("notifyOnReply").default(true).notNull(),
    notifyOnFollowUpDue: boolean("notifyOnFollowUpDue").default(true).notNull(),
    sendDelaySeconds: integer("sendDelaySeconds").default(5).notNull(), // delay between batch emails
    autoSendFollowUp: boolean("autoSendFollowUp").default(false).notNull(), // true=auto send, false=notify user first
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AutomationSetting = typeof automationSettings.$inferSelect;
export type InsertAutomationSetting = typeof automationSettings.$inferInsert;

// ============================================================
// 14. USER FEEDBACKS
// ============================================================
export const feedbacks = pgTable("feedbacks", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    rating: integer("rating").notNull(), // 1-5
    content: text("content").notNull(),
    category: varchar("category", { length: 64 }).default("general"), // general | bug | feature | ux
    status: feedbackStatusEnum("status").default("pending").notNull(),
    aiAnalysis: text("aiAnalysis"), // LLM analysis result
    aiScore: integer("aiScore"), // 0-100 value score from AI
    createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Feedback = typeof feedbacks.$inferSelect;
export type InsertFeedback = typeof feedbacks.$inferInsert;

// AI Prompt Settings - Admin configurable prompts for email generation
export const aiPromptSettings = pgTable("ai_prompt_settings", {
    id: serial("id").primaryKey(),
    promptKey: varchar("promptKey", { length: 100 }).notNull().unique(),
    promptText: text("promptText").notNull(),
    description: varchar("description", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AiPromptSetting = typeof aiPromptSettings.$inferSelect;
export type NewAiPromptSetting = typeof aiPromptSettings.$inferInsert;

// ============================================================
// 15. AUTH LOGS
// ============================================================
export const authLogs = pgTable("auth_logs", {
    id: serial("id").primaryKey(),
    userId: integer("userId"), // nullable for failed attempts where user doesn't exist
    email: varchar("email", { length: 320 }).notNull(),
    eventType: authEventTypeEnum("eventType").notNull(),
    errorMessage: varchar("errorMessage", { length: 500 }),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: varchar("userAgent", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuthLog = typeof authLogs.$inferSelect;
export type InsertAuthLog = typeof authLogs.$inferInsert;
