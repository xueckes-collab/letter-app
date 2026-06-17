import { eq, and, desc, asc, like, or, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  InsertUser, users,
  senderProfiles, InsertSenderProfile, SenderProfile,
  senderAssets, InsertSenderAsset,
  leads, InsertLead, Lead,
  websiteAnalyses, InsertWebsiteAnalysis,
  icpMatches, InsertIcpMatch,
  uspMatches, InsertUspMatch,
  emailSequences, InsertEmailSequence,
  replyAnalyses, InsertReplyAnalysis,
  leadStates, InsertLeadState,
  aiPromptSettings,
  notifications, InsertNotification,
  emailAccounts, InsertEmailAccount, EmailAccount,
  automationSettings,
  feedbacks,
  passwordResetTokens,
  authLogs,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function ensureLeadResearchColumns() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Skipping lead research column check: database not available");
    return;
  }

  await db.execute(sql`
    ALTER TABLE "leads"
      ADD COLUMN IF NOT EXISTS "researchStatus" varchar(64) DEFAULT 'not_started' NOT NULL,
      ADD COLUMN IF NOT EXISTS "researchError" text,
      ADD COLUMN IF NOT EXISTS "researchSources" json,
      ADD COLUMN IF NOT EXISTS "handoffBrief" text,
      ADD COLUMN IF NOT EXISTS "replyProbability" integer,
      ADD COLUMN IF NOT EXISTS "qualityScore" integer,
      ADD COLUMN IF NOT EXISTS "warningNotes" json,
      ADD COLUMN IF NOT EXISTS "creditsConsumed" integer DEFAULT 0 NOT NULL
  `);
}

// ============================================================
// USER HELPERS
// ============================================================
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUser(data: { email: string; passwordHash: string; name?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(users).values({
    email: data.email,
    passwordHash: data.passwordHash,
    name: data.name ?? data.email.split('@')[0],
    loginMethod: 'email',
    lastSignedIn: new Date(),
  }).returning({ id: users.id });
  const user = await getUserById(result[0].id);
  if (!user) throw new Error("Failed to create user");
  return user;
}

export async function createOrUpdateGoogleUser(data: { openId: string; email: string; name?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingByOpenId = await getUserByOpenId(data.openId);
  if (existingByOpenId) {
    await db.update(users).set({
      email: data.email,
      name: data.name ?? existingByOpenId.name,
      loginMethod: 'google',
      lastSignedIn: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, existingByOpenId.id));
    return (await getUserById(existingByOpenId.id))!;
  }

  const existingByEmail = await getUserByEmail(data.email);
  if (existingByEmail) {
    await db.update(users).set({
      openId: data.openId,
      name: data.name ?? existingByEmail.name,
      loginMethod: 'google',
      lastSignedIn: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, existingByEmail.id));
    return (await getUserById(existingByEmail.id))!;
  }

  const result = await db.insert(users).values({
    openId: data.openId,
    email: data.email,
    name: data.name ?? data.email.split('@')[0],
    loginMethod: 'google',
    lastSignedIn: new Date(),
  }).returning({ id: users.id });

  const user = await getUserById(result[0].id);
  if (!user) throw new Error("Failed to create Google user");
  return user;
}

export async function updateUserLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// Legacy: kept for backward compatibility with existing data
export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================
// SENDER PROFILE HELPERS
// ============================================================
export async function getSenderProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const profiles = await db.select().from(senderProfiles).where(eq(senderProfiles.userId, userId)).limit(1);
  if (!profiles.length) return null;
  const profile = profiles[0];
  const assets = await db.select().from(senderAssets).where(eq(senderAssets.senderProfileId, profile.id)).orderBy(desc(senderAssets.createdAt));
  return { ...profile, assets };
}

export async function upsertSenderProfile(userId: number, data: Omit<InsertSenderProfile, 'userId'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(senderProfiles).where(eq(senderProfiles.userId, userId)).limit(1);
  if (existing.length) {
    await db.update(senderProfiles).set({ ...data, updatedAt: new Date() }).where(eq(senderProfiles.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(senderProfiles).values({ ...data, userId }).returning({ id: senderProfiles.id });
  return result[0].id;
}

export async function createSenderAsset(data: InsertSenderAsset) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(senderAssets).values(data).returning({ id: senderAssets.id });
  return result[0].id;
}

// ============================================================
// LEAD HELPERS
// ============================================================
export async function createLead(data: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(leads).values(data).returning({ id: leads.id });
  return result[0].id;
}

export async function getLeadsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const leadRows = await db.select().from(leads).where(eq(leads.userId, userId)).orderBy(desc(leads.createdAt));
  // Attach lead state info
  const result = [];
  for (const lead of leadRows) {
    const stateRows = await db.select().from(leadStates).where(eq(leadStates.leadId, lead.id)).limit(1);
    const state = stateRows[0] || null;
    result.push({
      ...lead,
      currentState: state?.currentState || 'input_ready',
      currentRound: state?.currentRound || 0,
      lastReportNote: state?.lastReportNote || null,
    });
  }
  return result;
}

export async function getLeadById(leadId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, userId))).limit(1);
  return rows[0] || null;
}

export async function getLeadWithRelations(leadId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const lead = await getLeadById(leadId, userId);
  if (!lead) return null;

  const [waRows, icpRows, uspRows, emailRows, replyRows, stateRows] = await Promise.all([
    db.select().from(websiteAnalyses).where(eq(websiteAnalyses.leadId, leadId)).limit(1),
    db.select().from(icpMatches).where(eq(icpMatches.leadId, leadId)).limit(1),
    db.select().from(uspMatches).where(eq(uspMatches.leadId, leadId)).limit(1),
    db.select().from(emailSequences).where(eq(emailSequences.leadId, leadId)).orderBy(asc(emailSequences.createdAt)),
    db.select().from(replyAnalyses).where(eq(replyAnalyses.leadId, leadId)).orderBy(asc(replyAnalyses.createdAt)),
    db.select().from(leadStates).where(eq(leadStates.leadId, leadId)).limit(1),
  ]);

  return {
    lead,
    websiteAnalysis: waRows[0] || null,
    icpMatch: icpRows[0] || null,
    uspMatch: uspRows[0] || null,
    emailSequences: emailRows,
    replyAnalyses: replyRows,
    leadState: stateRows[0] || null,
  };
}

type LeadResearchArtifactsInput = {
  researchSources?: unknown;
  handoffBrief?: string | null;
  replyProbability?: number | null;
  qualityScore?: number | null;
  warningNotes?: unknown;
  creditsConsumed?: number;
  researchStatus?: string;
  researchError?: string | null;
};

export async function getLeadResearchArtifacts(leadId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: leads.id,
      userId: leads.userId,
      researchStatus: leads.researchStatus,
      researchError: leads.researchError,
      researchSources: leads.researchSources,
      handoffBrief: leads.handoffBrief,
      replyProbability: leads.replyProbability,
      qualityScore: leads.qualityScore,
      warningNotes: leads.warningNotes,
      creditsConsumed: leads.creditsConsumed,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)))
    .limit(1);
  return rows[0] || null;
}

export async function updateLeadResearchStatus(
  leadId: number,
  userId: number,
  researchStatus: string,
  researchError?: string | null
) {
  const db = await getDb();
  if (!db) return null;
  const updateSet: Partial<Pick<Lead, "researchStatus" | "researchError">> = { researchStatus };
  if (researchError !== undefined) {
    updateSet.researchError = researchError;
  }
  await db
    .update(leads)
    .set(updateSet)
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)));
  return getLeadResearchArtifacts(leadId, userId);
}

export async function saveLeadResearchArtifacts(
  leadId: number,
  userId: number,
  data: LeadResearchArtifactsInput
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateSet: Partial<Pick<
    Lead,
    | "researchSources"
    | "handoffBrief"
    | "replyProbability"
    | "qualityScore"
    | "warningNotes"
    | "creditsConsumed"
    | "researchStatus"
    | "researchError"
  >> = {};

  if (data.researchSources !== undefined) updateSet.researchSources = data.researchSources;
  if (data.handoffBrief !== undefined) updateSet.handoffBrief = data.handoffBrief;
  if (data.replyProbability !== undefined) updateSet.replyProbability = data.replyProbability;
  if (data.qualityScore !== undefined) updateSet.qualityScore = data.qualityScore;
  if (data.warningNotes !== undefined) updateSet.warningNotes = data.warningNotes;
  if (data.creditsConsumed !== undefined) updateSet.creditsConsumed = data.creditsConsumed;
  if (data.researchStatus !== undefined) updateSet.researchStatus = data.researchStatus;
  if (data.researchError !== undefined) updateSet.researchError = data.researchError;

  if (Object.keys(updateSet).length > 0) {
    await db
      .update(leads)
      .set(updateSet)
      .where(and(eq(leads.id, leadId), eq(leads.userId, userId)));
  }

  return getLeadResearchArtifacts(leadId, userId);
}

// ============================================================
// ANALYSIS HELPERS
// ============================================================
export async function saveWebsiteAnalysis(data: InsertWebsiteAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Upsert by leadId
  const existing = await db.select().from(websiteAnalyses).where(eq(websiteAnalyses.leadId, data.leadId)).limit(1);
  if (existing.length) {
    await db.update(websiteAnalyses).set(data).where(eq(websiteAnalyses.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(websiteAnalyses).values(data).returning({ id: websiteAnalyses.id });
  return result[0].id;
}

export async function saveIcpMatch(data: InsertIcpMatch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(icpMatches).where(eq(icpMatches.leadId, data.leadId)).limit(1);
  if (existing.length) {
    await db.update(icpMatches).set(data).where(eq(icpMatches.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(icpMatches).values(data).returning({ id: icpMatches.id });
  return result[0].id;
}

export async function saveUspMatch(data: InsertUspMatch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(uspMatches).where(eq(uspMatches.leadId, data.leadId)).limit(1);
  if (existing.length) {
    await db.update(uspMatches).set(data).where(eq(uspMatches.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(uspMatches).values(data).returning({ id: uspMatches.id });
  return result[0].id;
}

// ============================================================
// EMAIL SEQUENCE HELPERS
// ============================================================
export async function createEmailSequence(data: InsertEmailSequence) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailSequences).values(data).returning({ id: emailSequences.id });
  return result[0].id;
}

export async function updateEmailSequence(emailId: number, data: Partial<InsertEmailSequence>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailSequences).set(data).where(eq(emailSequences.id, emailId));
}

export async function getEmailsByLead(leadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailSequences).where(eq(emailSequences.leadId, leadId)).orderBy(asc(emailSequences.createdAt));
}

// ============================================================
// REPLY ANALYSIS HELPERS
// ============================================================
export async function createReplyAnalysis(data: InsertReplyAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(replyAnalyses).values(data).returning({ id: replyAnalyses.id });
  return result[0].id;
}

// ============================================================
// LEAD STATE HELPERS
// ============================================================
export async function getLeadState(leadId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(leadStates).where(eq(leadStates.leadId, leadId)).limit(1);
  return rows[0] || null;
}

export async function upsertLeadState(leadId: number, userId: number, data: Partial<InsertLeadState>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(leadStates).where(eq(leadStates.leadId, leadId)).limit(1);
  if (existing.length) {
    await db.update(leadStates).set({ ...data, updatedAt: new Date() }).where(eq(leadStates.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(leadStates).values({ leadId, userId, ...data } as InsertLeadState).returning({ id: leadStates.id });
  return result[0].id;
}

export async function updateLeadStatus(leadId: number, status: string, statusColor: string, replyStatus: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(leads).set({ status, statusColor, replyStatus }).where(eq(leads.id, leadId));
}

export async function updateLeadCompanyInfo(leadId: number, companyName: string, country: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(leads).set({ companyName, country }).where(eq(leads.id, leadId));
}

// ============================================================
// NOTIFICATION HELPERS
// ============================================================
export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notifications).values(data).returning({ id: notifications.id });
  return result[0].id;
}

export async function getNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result[0]?.count || 0;
}

export async function markNotificationRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true })
    .where(eq(notifications.userId, userId));
}

// ============================================================
// BATCH / AUTOMATION HELPERS
// ============================================================
export async function getLeadsReadyForFollowUp(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Find leads where followUpDueAt has passed, autoFollowUp is enabled, and no reply
  const now = new Date();
  const states = await db.select().from(leadStates)
    .where(and(
      eq(leadStates.userId, userId),
      eq(leadStates.autoFollowUpEnabled, true),
      eq(leadStates.hasReply, false),
      sql`${leadStates.followUpDueAt} IS NOT NULL AND ${leadStates.followUpDueAt} <= ${now}`
    ));

  const result = [];
  for (const state of states) {
    const lead = await db.select().from(leads).where(eq(leads.id, state.leadId)).limit(1);
    if (lead[0]) {
      result.push({ ...lead[0], leadState: state });
    }
  }
  return result;
}

export async function getLeadsByIds(leadIds: number[], userId: number) {
  const db = await getDb();
  if (!db) return [];
  if (!leadIds.length) return [];
  const result = [];
  for (const id of leadIds) {
    const rows = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, userId))).limit(1);
    if (rows[0]) result.push(rows[0]);
  }
  return result;
}

export async function markEmailSent(emailId: number, gmailMessageId?: string, gmailThreadId?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(emailSequences).set({
    status: "sent",
    sentAt: new Date(),
    gmailMessageId: gmailMessageId || null,
    gmailThreadId: gmailThreadId || null,
  }).where(eq(emailSequences.id, emailId));
}

export async function getLatestSentEmail(leadId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(emailSequences)
    .where(and(eq(emailSequences.leadId, leadId), eq(emailSequences.status, "sent")))
    .orderBy(desc(emailSequences.sentAt))
    .limit(1);
  return rows[0] || null;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getAiPromptSetting(promptKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(aiPromptSettings).where(eq(aiPromptSettings.promptKey, promptKey)).limit(1);
  return rows[0] || null;
}

// ============================================================
// EMAIL ACCOUNTS
// ============================================================
export async function createEmailAccount(data: InsertEmailAccount): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If setting as default, unset other defaults first
  if (data.isDefault) {
    await db.update(emailAccounts).set({ isDefault: false })
      .where(eq(emailAccounts.userId, data.userId));
  }

  const result = await db.insert(emailAccounts).values(data).returning({ id: emailAccounts.id });
  return result[0].id;
}

export async function getEmailAccountsByUser(userId: number): Promise<EmailAccount[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailAccounts)
    .where(eq(emailAccounts.userId, userId))
    .orderBy(desc(emailAccounts.createdAt));
}

export async function getEmailAccountById(accountId: number, userId: number): Promise<EmailAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(emailAccounts)
    .where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function getDefaultEmailAccount(userId: number): Promise<EmailAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  // Try default first
  let rows = await db.select().from(emailAccounts)
    .where(and(eq(emailAccounts.userId, userId), eq(emailAccounts.isDefault, true)))
    .limit(1);
  if (rows[0]) return rows[0];
  // Fallback to first account
  rows = await db.select().from(emailAccounts)
    .where(eq(emailAccounts.userId, userId))
    .limit(1);
  return rows[0];
}

export async function updateEmailAccount(accountId: number, userId: number, data: Partial<InsertEmailAccount>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  if (data.isDefault) {
    await db.update(emailAccounts).set({ isDefault: false })
      .where(eq(emailAccounts.userId, userId));
  }

  await db.update(emailAccounts).set(data)
    .where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.userId, userId)));
}

export async function deleteEmailAccount(accountId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(emailAccounts)
    .where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.userId, userId)));
}

// Get draft emails for a list of leads (for batch sending)
export async function getDraftEmailsForLeads(leadIds: number[], userId: number) {
  const db = await getDb();
  if (!db) return [];
  if (!leadIds.length) return [];

  const results: Array<{
    emailId: number; leadId: number; to: string; subject: string; body: string;
    companyName: string | null; emailType: string;
  }> = [];

  for (const leadId of leadIds) {
    // Get the latest draft email for this lead
    const emails = await db.select().from(emailSequences)
      .where(and(
        eq(emailSequences.leadId, leadId),
        eq(emailSequences.userId, userId),
        eq(emailSequences.status, 'draft')
      ))
      .orderBy(desc(emailSequences.createdAt))
      .limit(1);

    if (emails[0] && emails[0].subject && emails[0].body) {
      const lead = await db.select().from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (lead[0]) {
        results.push({
          emailId: emails[0].id,
          leadId,
          to: lead[0].email,
          subject: emails[0].subject,
          body: emails[0].body,
          companyName: lead[0].companyName,
          emailType: emails[0].emailType,
        });
      }
    }
  }

  return results;
}

// ============================================================
// AUTOMATION SETTINGS
// ============================================================
export async function getAutomationSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(automationSettings).where(eq(automationSettings.userId, userId)).limit(1);
  return rows[0] || null;
}

export async function upsertAutomationSettings(userId: number, data: {
  followUpHours?: number;
  maxFollowUpRounds?: number;
  autoFollowUpEnabled?: boolean;
  replyCheckEnabled?: boolean;
  notifyOnReply?: boolean;
  notifyOnFollowUpDue?: boolean;
  sendDelaySeconds?: number;
  autoSendFollowUp?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;
  const existing = await getAutomationSettings(userId);
  if (existing) {
    const updateSet: Record<string, unknown> = {};
    if (data.followUpHours !== undefined) updateSet.followUpHours = data.followUpHours;
    if (data.maxFollowUpRounds !== undefined) updateSet.maxFollowUpRounds = data.maxFollowUpRounds;
    if (data.autoFollowUpEnabled !== undefined) updateSet.autoFollowUpEnabled = data.autoFollowUpEnabled;
    if (data.replyCheckEnabled !== undefined) updateSet.replyCheckEnabled = data.replyCheckEnabled;
    if (data.notifyOnReply !== undefined) updateSet.notifyOnReply = data.notifyOnReply;
    if (data.notifyOnFollowUpDue !== undefined) updateSet.notifyOnFollowUpDue = data.notifyOnFollowUpDue;
    if (data.sendDelaySeconds !== undefined) updateSet.sendDelaySeconds = data.sendDelaySeconds;
    if (data.autoSendFollowUp !== undefined) updateSet.autoSendFollowUp = data.autoSendFollowUp;
    if (Object.keys(updateSet).length > 0) {
      await db.update(automationSettings).set(updateSet).where(eq(automationSettings.userId, userId));
    }
  } else {
    await db.insert(automationSettings).values({
      userId,
      followUpHours: data.followUpHours ?? 48,
      maxFollowUpRounds: data.maxFollowUpRounds ?? 9,
      autoFollowUpEnabled: data.autoFollowUpEnabled ?? true,
      replyCheckEnabled: data.replyCheckEnabled ?? true,
      notifyOnReply: data.notifyOnReply ?? true,
      notifyOnFollowUpDue: data.notifyOnFollowUpDue ?? true,
      sendDelaySeconds: data.sendDelaySeconds ?? 180,
      autoSendFollowUp: data.autoSendFollowUp ?? false,
    });
  }
  return getAutomationSettings(userId);
}

// ============================================================
// FEEDBACKS
// ============================================================
export async function createFeedback(userId: number, data: {
  rating: number;
  content: string;
  category?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(feedbacks).values({
    userId,
    rating: data.rating,
    content: data.content,
    category: data.category || 'general',
    status: 'pending',
  }).returning({ id: feedbacks.id });
  const rows = await db.select().from(feedbacks).where(eq(feedbacks.id, result[0].id)).limit(1);
  return rows[0] || null;
}

export async function getFeedbacksByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(feedbacks).where(eq(feedbacks.userId, userId)).orderBy(feedbacks.createdAt);
}

export async function getAllFeedbacks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(feedbacks).orderBy(feedbacks.createdAt);
}

export async function updateFeedbackAnalysis(id: number, data: {
  status: 'analyzed' | 'valuable' | 'archived';
  aiAnalysis: string;
  aiScore: number;
}) {
  const db = await getDb();
  if (!db) return null;
  await db.update(feedbacks).set({
    status: data.status,
    aiAnalysis: data.aiAnalysis,
    aiScore: data.aiScore,
  }).where(eq(feedbacks.id, id));
  const rows = await db.select().from(feedbacks).where(eq(feedbacks.id, id)).limit(1);
  return rows[0] || null;
}

export async function deleteFeedback(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(feedbacks).where(eq(feedbacks.id, id));
}


// ============================================================
// SEED ADMIN USER
// ============================================================
export async function seedAdminUser(adminEmail: string) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, adminEmail));
    console.log('[Seed] Admin role set for:', adminEmail);
  } catch (err) {
    console.warn('[Seed] Failed to set admin role:', err);
  }
}
export async function getSenderAssetById(assetId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(senderAssets)
    .where(and(eq(senderAssets.id, assetId), eq(senderAssets.userId, userId)))
    .limit(1);
  return result[0] || null;
}

export async function deleteSenderAsset(
  assetId: number,
  userId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .delete(senderAssets)
    .where(and(eq(senderAssets.id, assetId), eq(senderAssets.userId, userId)))
    .returning({ id: senderAssets.id });
  return result.length > 0;
}

// ============================================================
// DELETE LEADS BY IDS (batch delete)
// ============================================================
export async function deleteLeadsByIds(leadIds: number[], userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete related data first (foreign key constraints)
  await db.delete(replyAnalyses).where(inArray(replyAnalyses.leadId, leadIds));
  await db.delete(emailSequences).where(inArray(emailSequences.leadId, leadIds));
  await db.delete(uspMatches).where(inArray(uspMatches.leadId, leadIds));
  await db.delete(icpMatches).where(inArray(icpMatches.leadId, leadIds));
  await db.delete(websiteAnalyses).where(inArray(websiteAnalyses.leadId, leadIds));
  await db.delete(leadStates).where(inArray(leadStates.leadId, leadIds));

  // Delete the leads themselves
  const result = await db
    .delete(leads)
    .where(and(inArray(leads.id, leadIds), eq(leads.userId, userId)))
    .returning({ id: leads.id });

  return result.length;
}


// PASSWORD RESET TOKEN HELPERS
// ============================================================

export async function createPasswordResetToken(data: {
  userId: number;
  token: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(passwordResetTokens)
    .values({
      userId: data.userId,
      token: data.token,
      expiresAt: data.expiresAt,
    })
    .returning({ id: passwordResetTokens.id });
  return result[0].id;
}

export async function getPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false)
      )
    )
    .limit(1);
  return rows[0] || null;
}

export async function invalidatePasswordResetTokens(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(passwordResetTokens)
    .set({ used: true })
    .where(eq(passwordResetTokens.userId, userId));
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// Simplified: log the reset URL to console; in production, integrate with nodemailer
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
  name: string
): Promise<void> {
  console.log(`[Auth] Password reset email for ${email}: ${resetUrl}`);

  const smtpHost = process.env.SYSTEM_SMTP_HOST;
  const smtpPort = process.env.SYSTEM_SMTP_PORT;
  const smtpUser = process.env.SYSTEM_SMTP_USER;
  const smtpPass = process.env.SYSTEM_SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || "587"),
      secure: smtpPort === "465",
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: email,
      subject: "密码重置 - Outbound Mail OS",
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2>密码重置</h2><p>你好 ${name}，</p><p>请点击下方链接重置密码：</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:8px">重置密码</a></p><p>此链接有效期为1小时。</p></div>`,
    });
    console.log(`[Auth] Reset email sent to ${email}`);
  }
}

// ============================================================
// AUTH LOG HELPERS (for admin audit page)
// ============================================================

export async function getAuthLogs(options: {
  limit?: number;
  offset?: number;
  eventType?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options.eventType) {
    conditions.push(eq(authLogs.eventType, options.eventType as any));
  }

  const query = db
    .select()
    .from(authLogs)
    .orderBy(desc(authLogs.createdAt))
    .limit(options.limit || 100)
    .offset(options.offset || 0);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function getAuthLogCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(authLogs);
  return result[0]?.count || 0;
}

export async function getSentEmailLogs(options: {
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: emailSequences.id,
      userId: emailSequences.userId,
      leadId: emailSequences.leadId,
      emailType: emailSequences.emailType,
      subject: emailSequences.subject,
      status: emailSequences.status,
      sentAt: emailSequences.sentAt,
      createdAt: emailSequences.createdAt,
      leadEmail: leads.email,
      leadCompany: leads.companyName,
    })
    .from(emailSequences)
    .leftJoin(leads, eq(emailSequences.leadId, leads.id))
    .where(eq(emailSequences.status, "sent"))
    .orderBy(desc(emailSequences.sentAt))
    .limit(options.limit || 100)
    .offset(options.offset || 0);
}
