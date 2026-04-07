import { eq, and, desc, asc, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================
// USER HELPERS
// ============================================================
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

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
  const result = await db.insert(senderProfiles).values({ ...data, userId }).$returningId();
  return result[0].id;
}

export async function createSenderAsset(data: InsertSenderAsset) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(senderAssets).values(data).$returningId();
  return result[0].id;
}

// ============================================================
// LEAD HELPERS
// ============================================================
export async function createLead(data: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(leads).values(data).$returningId();
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
  const result = await db.insert(websiteAnalyses).values(data).$returningId();
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
  const result = await db.insert(icpMatches).values(data).$returningId();
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
  const result = await db.insert(uspMatches).values(data).$returningId();
  return result[0].id;
}

// ============================================================
// EMAIL SEQUENCE HELPERS
// ============================================================
export async function createEmailSequence(data: InsertEmailSequence) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailSequences).values(data).$returningId();
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
  const result = await db.insert(replyAnalyses).values(data).$returningId();
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
  const result = await db.insert(leadStates).values({ leadId, userId, ...data } as InsertLeadState).$returningId();
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
import { notifications, InsertNotification } from "../drizzle/schema";

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notifications).values(data).$returningId();
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

// ============================================================
// EMAIL ACCOUNTS
// ============================================================
import { emailAccounts, InsertEmailAccount, EmailAccount } from "../drizzle/schema";

export async function createEmailAccount(data: InsertEmailAccount): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If setting as default, unset other defaults first
  if (data.isDefault) {
    await db.update(emailAccounts).set({ isDefault: false })
      .where(eq(emailAccounts.userId, data.userId));
  }

  const result = await db.insert(emailAccounts).values(data).$returningId();
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
import { automationSettings } from "../drizzle/schema";

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
      sendDelaySeconds: data.sendDelaySeconds ?? 5,
      autoSendFollowUp: data.autoSendFollowUp ?? false,
    });
  }
  return getAutomationSettings(userId);
}

// ============================================================
// FEEDBACKS
// ============================================================
import { feedbacks } from "../drizzle/schema";

export async function createFeedback(userId: number, data: {
  rating: number;
  content: string;
  category?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(feedbacks).values({
    userId,
    rating: data.rating,
    content: data.content,
    category: data.category || 'general',
    status: 'pending',
  });
  const id = (result as any).insertId;
  const rows = await db.select().from(feedbacks).where(eq(feedbacks.id, id)).limit(1);
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
