/**
 * Server-side Scheduler
 * Runs periodic tasks:
 * 1. Check for leads needing follow-up → auto-generate follow-up emails, optionally auto-send
 * 2. Check for replies via IMAP → create notifications
 */
import { getDb } from "../db";
import { getAutomationSettings, getLeadWithRelations, createEmailSequence, upsertLeadState, updateLeadStatus } from "../db";
import { leads, leadStates, emailAccounts, notifications, emailSequences } from "../../drizzle/schema";
import { eq, and, lte, isNotNull, sql } from "drizzle-orm";
import { generateEmail } from "./llm-engine";
import { getStrategyForRound } from "./follow-up-strategies";
import { sendEmail } from "./email-sender";
import { getSenderProfile } from "../db";

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

  // Get user automation settings
  const settings = await getAutomationSettings(userId);
  const autoSend = settings?.autoSendFollowUp ?? false;
  const maxRounds = settings?.maxFollowUpRounds ?? 9;

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

  // Filter leads that haven't exceeded max rounds
  const eligibleLeads = dueLeads.filter(l => l.round < maxRounds);
  if (eligibleLeads.length === 0) return;

  // Build sender context for LLM
  const profile = await getSenderProfile(userId);
  const senderContext = profile
    ? `Company: ${profile.companyName}\nProducts: ${profile.mainProducts}\nAdvantages: ${profile.coreAdvantages}`
    : 'No sender profile configured.';

  const generatedLeads: Array<{ leadId: number; emailId: number; companyName: string | null }> = [];
  const failedLeads: Array<{ leadId: number; error: string }> = [];

  for (const lead of eligibleLeads) {
    try {
      // Check for existing unread followup_due notification for this lead to avoid duplicates
      const existingNotif = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.type, "followup_due"),
            eq(notifications.isRead, false),
            sql`${notifications.leadId} = ${lead.leadId}`
          )
        )
        .limit(1);

      if (existingNotif.length > 0) continue;

      // Get full lead data for email generation
      const leadData = await getLeadWithRelations(lead.leadId, userId);
      if (!leadData) continue;

      const nextRound = (lead.round || 0) + 1;
      const strategy = getStrategyForRound(nextRound);

      const previousEmails = leadData.emailSequences.map((e: any) => ({
        subject: e.subject || '', body: e.body || '', type: e.emailType,
      }));

      // Auto-generate follow-up email via LLM
      const emailResult = await generateEmail({
        type: 'followup',
        websiteAnalysis: (leadData.websiteAnalysis || {}) as Record<string, unknown>,
        icpMatch: (leadData.icpMatch || {}) as Record<string, unknown>,
        uspMatch: (leadData.uspMatch || {}) as Record<string, unknown>,
        senderContext,
        contactName: lead.contactName || undefined,
        round: nextRound,
        previousEmails,
        followupStrategy: strategy ? (strategy as unknown as Record<string, unknown>) : undefined,
      });

      const emailId = await createEmailSequence({
        userId, leadId: lead.leadId, emailType: 'followup',
        subject: emailResult.subject, body: emailResult.body,
        strategyType: strategy?.name || `Round ${nextRound}`, stageNumber: nextRound,
        thinkingSummary: [
          { title: `Auto-generated Round ${nextRound}`, items: [strategy?.description || '', emailResult.strategyNotes] },
        ],
        status: 'draft',
      });

      await upsertLeadState(lead.leadId, userId, {
        currentState: autoSend ? 'email_sent' : 'waiting_user_send_followup',
        currentRound: nextRound,
        lastEmailType: 'followup',
        nextAction: autoSend ? 'Follow-up auto-sent' : `Send round ${nextRound} follow-up email`,
      });

      if (autoSend) {
        // Auto-send the email
        const sendResult = await sendEmail(userId, emailId);
        if (sendResult.success) {
          await updateLeadStatus(lead.leadId, 'contacted', 'blue', 'not_checked');
          console.log(`[Scheduler] Auto-sent follow-up R${nextRound} to ${lead.email}`);
        } else {
          // Send failed, revert to draft state
          await upsertLeadState(lead.leadId, userId, {
            currentState: 'waiting_user_send_followup',
            nextAction: `Send round ${nextRound} follow-up email (auto-send failed)`,
          });
          await updateLeadStatus(lead.leadId, 'followup_drafted', 'amber', 'not_checked');
          failedLeads.push({ leadId: lead.leadId, error: sendResult.error || 'Send failed' });
        }
      } else {
        await updateLeadStatus(lead.leadId, 'followup_drafted', 'amber', 'not_checked');
      }

      generatedLeads.push({ leadId: lead.leadId, emailId, companyName: lead.companyName });
    } catch (err: any) {
      failedLeads.push({ leadId: lead.leadId, error: err.message?.substring(0, 100) || 'Unknown error' });
      console.error(`[Scheduler] Failed to generate follow-up for lead ${lead.leadId}:`, err.message);
    }
  }

  if (generatedLeads.length === 0) return;

  const leadNames = generatedLeads.map(l => l.companyName || `Lead #${l.leadId}`).slice(0, 5).join('、');
  const moreText = generatedLeads.length > 5 ? ` 等 ${generatedLeads.length} 个客户` : '';

  if (autoSend) {
    await db.insert(notifications).values({
      userId,
      type: 'batch_complete',
      title: `自动跟进已发送 ${generatedLeads.length} 封`,
      message: `已自动生成并发送跟进邮件：${leadNames}${moreText}。${failedLeads.length > 0 ? `另有 ${failedLeads.length} 封发送失败。` : ''}`,
      actionUrl: '/leads',
      isRead: false,
    });
  } else {
    await db.insert(notifications).values({
      userId,
      type: 'followup_due',
      title: `${generatedLeads.length} 封跟进邮件已生成，等待发送`,
      message: `已为 ${leadNames}${moreText} 自动生成跟进邮件，请前往自动化中心确认发送。`,
      actionUrl: '/automation',
      isRead: false,
    });
  }

  console.log(`[Scheduler] Follow-up for user ${userId}: generated=${generatedLeads.length}, autoSent=${autoSend}, failed=${failedLeads.length}`);
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
