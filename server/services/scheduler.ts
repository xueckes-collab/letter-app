/**
 * Server-side Scheduler
 * Runs periodic tasks:
 * 1. Check for leads needing 48-hour follow-up → create notifications
 * 2. Check for replies via IMAP → create notifications
 */
import { getDb } from "../db";
import { getAutomationSettings } from "../db";
import { leads, leadStates, emailAccounts, notifications } from "../../drizzle/schema";
import { eq, and, lte, isNotNull, sql } from "drizzle-orm";

const FOLLOW_UP_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
const REPLY_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes

let followUpTimer: ReturnType<typeof setInterval> | null = null;
let replyTimer: ReturnType<typeof setInterval> | null = null;
let schedulerHealthy = true;
let lastFollowUpCheck: Date | null = null;
let lastReplyCheck: Date | null = null;
let followUpErrors = 0;
let replyErrors = 0;

// ─── Health Status ─────────────────────────────────────────
export function getSchedulerHealth() {
  return {
    healthy: schedulerHealthy,
    lastFollowUpCheck,
    lastReplyCheck,
    followUpErrors,
    replyErrors,
  };
}

// ─── Follow-Up Due Detection ────────────────────────────────
async function checkAllUsersFollowUpDue() {
  try {
    const db = await getDb();
    if (!db) return;

    const usersWithFollowUps = await db
      .selectDistinct({ userId: leadStates.userId })
      .from(leadStates)
      .where(
        and(
          eq(leadStates.autoFollowUpEnabled, true),
          eq(leadStates.hasReply, false),
          eq(leadStates.currentState, "email_sent"),
          isNotNull(leadStates.followUpDueAt)
        )
      );

    for (const { userId } of usersWithFollowUps) {
      await checkUserFollowUpDue(userId);
    }

    lastFollowUpCheck = new Date();
    followUpErrors = 0;
    console.log(`[Scheduler] Follow-up check completed for ${usersWithFollowUps.length} users`);
  } catch (error) {
    followUpErrors++;
    console.error("[Scheduler] Follow-up check error:", error);
    if (followUpErrors >= 5) {
      schedulerHealthy = false;
      console.error("[Scheduler] Too many follow-up errors, marking unhealthy");
    }
  }
}

async function checkUserFollowUpDue(userId: number) {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  const dueLeads = await db
    .select({
      leadId: leadStates.leadId,
      lastSentAt: leadStates.lastSentAt,
      round: leadStates.currentRound,
      followUpDueAt: leadStates.followUpDueAt,
      email: leads.email,
      companyName: leads.companyName,
      contactName: leads.contactName,
    })
    .from(leadStates)
    .innerJoin(leads, eq(leads.id, leadStates.leadId))
    .where(
      and(
        eq(leadStates.userId, userId),
        eq(leadStates.autoFollowUpEnabled, true),
        eq(leadStates.hasReply, false),
        eq(leadStates.currentState, "email_sent"),
        isNotNull(leadStates.followUpDueAt),
        lte(leadStates.followUpDueAt, now)
      )
    );

  if (dueLeads.length === 0) return;

  // Check for existing unread follow-up notification to avoid duplicates
  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "followup_due"),
        eq(notifications.isRead, false)
      )
    )
    .limit(1);

  if (existing.length > 0) return;

  const leadNames = dueLeads
    .map(l => l.companyName || l.email)
    .slice(0, 5)
    .join("、");
  const moreText = dueLeads.length > 5 ? ` 等 ${dueLeads.length} 个客户` : "";

  await db.insert(notifications).values({
    userId,
    type: "followup_due",
    title: `${dueLeads.length} 个客户需要跟进`,
    message: `${leadNames}${moreText} 已超过跟进间隔未回复，建议发送跟进邮件。`,
    actionUrl: "/automation",
    isRead: false,
  });

  // Update lead states
  for (const lead of dueLeads) {
    await db
      .update(leadStates)
      .set({
        currentState: "followup_due",
        nextAction: "Generate and send follow-up email",
      })
      .where(
        and(eq(leadStates.userId, userId), eq(leadStates.leadId, lead.leadId))
      );

    await db
      .update(leads)
      .set({ status: "followup_due", statusColor: "amber" })
      .where(eq(leads.id, lead.leadId));
  }

  console.log(`[Scheduler] Created follow-up notification for user ${userId}: ${dueLeads.length} leads due`);
}

// ─── Reply Detection via IMAP ───────────────────────────────
async function checkAllUsersReplies() {
  try {
    const db = await getDb();
    if (!db) return;

    const usersWithAccounts = await db
      .selectDistinct({ userId: emailAccounts.userId })
      .from(emailAccounts);

    for (const { userId } of usersWithAccounts) {
      await checkUserReplies(userId);
    }

    lastReplyCheck = new Date();
    replyErrors = 0;
    console.log(`[Scheduler] Reply check completed for ${usersWithAccounts.length} users`);
  } catch (error) {
    replyErrors++;
    console.error("[Scheduler] Reply check error:", error);
    if (replyErrors >= 5) {
      schedulerHealthy = false;
      console.error("[Scheduler] Too many reply errors, marking unhealthy");
    }
  }
}

async function checkUserReplies(userId: number) {
  const db = await getDb();
  if (!db) return;

  // Get contacted leads without replies
  const contactedLeads = await db
    .select({
      leadId: leads.id,
      email: leads.email,
      companyName: leads.companyName,
    })
    .from(leads)
    .innerJoin(leadStates, and(eq(leadStates.leadId, leads.id), eq(leadStates.userId, userId)))
    .where(
      and(
        eq(leads.userId, userId),
        eq(leadStates.hasReply, false),
        sql`${leads.status} IN ('contacted', 'email_sent', 'followup_due')`
      )
    );

  if (contactedLeads.length === 0) return;

  // Get user's email accounts
  const accounts = await db
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.userId, userId));

  if (accounts.length === 0) return;

  for (const account of accounts) {
    // Resolve IMAP config: prefer explicit fields, fallback to derived
    const imapConfig = resolveImapConfig(account);
    if (!imapConfig) continue;
    if (!account.smtpUser || !account.smtpPass) continue;

    try {
      const { default: Imap } = await import("imap");

      const imap = new Imap({
        user: account.smtpUser,
        password: account.smtpPass,
        host: imapConfig.host,
        port: imapConfig.port,
        tls: imapConfig.tls,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 15000,
        authTimeout: 15000,
      });

      await new Promise<void>((resolve) => {
        imap.once("ready", () => {
          imap.openBox("INBOX", true, (err: any) => {
            if (err) { imap.end(); resolve(); return; }

            const sinceDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

            // Search for each lead email individually for reliability
            const searchPromises = contactedLeads.map(lead =>
              searchForLeadReply(imap, lead, sinceDate, userId, db)
            );

            // Process sequentially to avoid IMAP concurrency issues
            (async () => {
              for (const searchFn of searchPromises) {
                await searchFn;
              }
              imap.end();
              resolve();
            })();
          });
        });

        imap.once("error", (err: any) => {
          console.warn(`[Scheduler] IMAP error for ${account.email}:`, err.message);
          resolve();
        });

        imap.once("end", () => resolve());

        imap.connect();
      });
    } catch (error: any) {
      console.warn(`[Scheduler] IMAP check failed for ${account.email}:`, error.message);
    }
  }
}

async function searchForLeadReply(
  imap: any,
  lead: { leadId: number; email: string; companyName: string | null },
  sinceDate: Date,
  userId: number,
  db: any
): Promise<void> {
  return new Promise<void>((resolve) => {
    // Search for emails FROM this specific lead since the date
    imap.search(
      [["SINCE", sinceDate], ["FROM", lead.email]],
      async (searchErr: any, results: number[]) => {
        if (searchErr || !results || results.length === 0) {
          resolve();
          return;
        }

        // Check if we already have a notification for this lead's reply
        const existingNotif = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.leadId, lead.leadId),
              eq(notifications.type, "reply_detected")
            )
          )
          .limit(1);

        if (existingNotif.length > 0) {
          resolve();
          return;
        }

        // Fetch the most recent message to get subject
        const lastResult = results[results.length - 1];
        const fetch = imap.fetch([lastResult], {
          bodies: ["HEADER.FIELDS (FROM SUBJECT DATE)"],
          struct: true,
        });

        let subject = "(无主题)";

        fetch.on("message", (msg: any) => {
          msg.on("body", (stream: any) => {
            let buffer = "";
            stream.on("data", (chunk: any) => { buffer += chunk.toString("utf8"); });
            stream.on("end", () => {
              const subjectMatch = buffer.match(/Subject:\s*(.+)/i);
              if (subjectMatch) subject = subjectMatch[1].trim();
            });
          });
        });

        fetch.once("end", async () => {
          // Create notification with leadId for deterministic dedup
          await db.insert(notifications).values({
            userId,
            leadId: lead.leadId,
            type: "reply_detected",
            title: `收到回信：${lead.companyName || lead.email}`,
            message: `${lead.email} 回复了邮件，主题：${subject}。请尽快查看并回复。`,
            actionUrl: `/leads/${lead.leadId}`,
            isRead: false,
          });

          // Update lead status
          await db
            .update(leads)
            .set({ status: "reply_received", replyStatus: "has_reply", statusColor: "violet" })
            .where(eq(leads.id, lead.leadId));

          await db
            .update(leadStates)
            .set({ hasReply: true, currentState: "reply_received" })
            .where(and(eq(leadStates.userId, userId), eq(leadStates.leadId, lead.leadId)));

          console.log(`[Scheduler] Reply detected from ${lead.email} for lead ${lead.leadId}`);
          resolve();
        });

        fetch.once("error", () => resolve());
      }
    );
  });
}

// Resolve IMAP config: prefer explicit fields, fallback to SMTP->IMAP derivation
function resolveImapConfig(account: {
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  smtpHost: string | null;
}): { host: string; port: number; tls: boolean } | null {
  // Use explicit IMAP config if provided
  if (account.imapHost && account.imapPort) {
    return {
      host: account.imapHost,
      port: account.imapPort,
      tls: account.imapSecure,
    };
  }

  // Fallback: derive from SMTP host
  if (!account.smtpHost) return null;

  const mapping: Record<string, { host: string; port: number; tls: boolean }> = {
    "smtp.gmail.com": { host: "imap.gmail.com", port: 993, tls: true },
    "smtp.office365.com": { host: "outlook.office365.com", port: 993, tls: true },
    "smtp.mail.yahoo.com": { host: "imap.mail.yahoo.com", port: 993, tls: true },
    "smtp.163.com": { host: "imap.163.com", port: 993, tls: true },
    "smtp.qq.com": { host: "imap.qq.com", port: 993, tls: true },
    "smtp.zoho.com": { host: "imap.zoho.com", port: 993, tls: true },
    "smtp.mail.me.com": { host: "imap.mail.me.com", port: 993, tls: true },
    "smtp.fastmail.com": { host: "imap.fastmail.com", port: 993, tls: true },
    "smtp.snov.io": { host: "imap.snov.io", port: 993, tls: true },
    "smtp.yandex.com": { host: "imap.yandex.com", port: 993, tls: true },
    "smtp.aol.com": { host: "imap.aol.com", port: 993, tls: true },
    "smtp.mail.ru": { host: "imap.mail.ru", port: 993, tls: true },
    "smtp.protonmail.ch": { host: "127.0.0.1", port: 1143, tls: false }, // ProtonMail Bridge
  };

  const derived = mapping[account.smtpHost];
  if (derived) return derived;

  // Generic fallback: try replacing smtp. with imap.
  if (account.smtpHost.startsWith("smtp.")) {
    return {
      host: account.smtpHost.replace("smtp.", "imap."),
      port: 993,
      tls: true,
    };
  }

  return null;
}

// ─── Start/Stop Scheduler ───────────────────────────────────
export function startScheduler() {
  console.log("[Scheduler] Starting background tasks...");

  // Run follow-up check after 10s delay
  setTimeout(() => {
    checkAllUsersFollowUpDue().catch(console.error);
  }, 10000);

  // Run reply check after 20s delay
  setTimeout(() => {
    checkAllUsersReplies().catch(console.error);
  }, 20000);

  followUpTimer = setInterval(() => {
    checkAllUsersFollowUpDue().catch(console.error);
  }, FOLLOW_UP_CHECK_INTERVAL);

  replyTimer = setInterval(() => {
    checkAllUsersReplies().catch(console.error);
  }, REPLY_CHECK_INTERVAL);

  console.log(`[Scheduler] Follow-up check: every ${FOLLOW_UP_CHECK_INTERVAL / 60000} min`);
  console.log(`[Scheduler] Reply check: every ${REPLY_CHECK_INTERVAL / 60000} min`);
}

export function stopScheduler() {
  if (followUpTimer) { clearInterval(followUpTimer); followUpTimer = null; }
  if (replyTimer) { clearInterval(replyTimer); replyTimer = null; }
  console.log("[Scheduler] Background tasks stopped");
}
