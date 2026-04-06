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
