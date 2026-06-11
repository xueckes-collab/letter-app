/**
 * Unified Email Sending Service
 * Supports: SMTP (any provider), Snov.io campaigns, Gmail MCP
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getDb, getDefaultEmailAccount, getSenderProfile, getAutomationSettings } from "../db";
import { emailAccounts, emailSequences, leadStates, leads, notifications } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getSnovioToken } from "./snovio";
import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    inReplyTo?: string; // for threading
  references?: string; // for threading
}

export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider: string;
}

function formatEmailHtml(body: string, signature?: string | null, fontSize = 14, fontFamily = 'Arial, sans-serif', logoUrl?: string | null) {
    const escapeHtml = (value: string) => value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const main = escapeHtml(body).replace(/\n/g, "<br />");
    const logoHtml = logoUrl ? `<div style="margin-bottom:8px;"><img src="${logoUrl}" alt="Logo" style="height:50px;max-width:200px;object-fit:contain;display:block;" /></div>` : "";
    const sig = signature?.trim() ? `<br /><br />${logoHtml}${escapeHtml(signature.trim()).replace(/\n/g, "<br />")}` : (logoUrl ? `<br /><br />${logoHtml}` : "");

  return `<div style="font-size:${fontSize}px;font-family:${fontFamily};line-height:1.65;color:#111827;">${main}${sig}</div>`;
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── SMTP Sender ──────────────────────────────────────────────────────────────
export async function sendViaSmtp(
    accountConfig: {
          smtpHost: string;
          smtpPort: number;
          smtpUser: string;
          smtpPass: string;
          smtpSecure: boolean;
          email: string;
          label: string;
    },
    params: SendEmailParams
  ): Promise<SendResult> {
    try {
          const transporter: Transporter = nodemailer.createTransport({
                  host: accountConfig.smtpHost,
                  port: accountConfig.smtpPort,
                  secure: accountConfig.smtpSecure,
                  auth: {
                            user: accountConfig.smtpUser,
                            pass: accountConfig.smtpPass,
                  },
                  tls: {
                            rejectUnauthorized: false, // allow self-signed certs
                  },
          });

      const mailOptions: any = {
              from: `"${accountConfig.label}" <${accountConfig.email}>`,
              to: params.to,
              subject: params.subject,
              html: params.html,
              text: params.text || params.html.replace(/<[^>]*>/g, ""),
      };

      if (params.replyTo) mailOptions.replyTo = params.replyTo;
          if (params.inReplyTo) mailOptions.inReplyTo = params.inReplyTo;
          if (params.references) mailOptions.references = params.references;

      const info = await transporter.sendMail(mailOptions);

      return {
              success: true,
              messageId: info.messageId,
              provider: "smtp",
      };
    } catch (error: any) {
          return {
                  success: false,
                  error: error.message || "SMTP send failed",
                  provider: "smtp",
          };
    }
}

// ─── Verify SMTP Connection ───────────────────────────────────────────────────
export async function verifySmtp(config: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpSecure: boolean;
}): Promise<{ success: boolean; error?: string }> {
    try {
          const transporter = nodemailer.createTransport({
                  host: config.smtpHost,
                  port: config.smtpPort,
                  secure: config.smtpSecure,
                  auth: {
                            user: config.smtpUser,
                            pass: config.smtpPass,
                  },
                  tls: { rejectUnauthorized: false },
          });

      await transporter.verify();
          return { success: true };
    } catch (error: any) {
          return { success: false, error: error.message };
    }
}

export const verifySMTP = verifySmtp;

// ─── Snov.io Campaign Sender ──────────────────────────────────────────────────
// Snov.io doesn't have a direct "send email" API.
// Instead, we add prospects to a Snov.io list, then the user can
// start a campaign in Snov.io dashboard. We also track replies.
export async function addProspectToSnovioList(
    snovioClientId: string,
    snovioClientSecret: string,
    params: {
          email: string;
          firstName?: string;
          lastName?: string;
          listId: number;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
          const token = await getSnovioToken(snovioClientId, snovioClientSecret);

      const response = await axios.post(
              "https://api.snov.io/v1/add-prospect-to-list",
        {
                  email: params.email,
                  firstName: params.firstName || "",
                  lastName: params.lastName || "",
                  listId: params.listId,
        },
        {
                  headers: { Authorization: `Bearer ${token}` },
        }
            );

      return { success: true };
    } catch (error: any) {
          return { success: false, error: error.message };
    }
}

// ─── Get Snov.io Campaign Replies ─────────────────────────────────────────────
export async function getSnovioCampaignReplies(
    snovioClientId: string,
    snovioClientSecret: string
  ): Promise<any[]> {
    try {
          const token = await getSnovioToken(snovioClientId, snovioClientSecret);

      const response = await axios.get(
              "https://api.snov.io/v1/get-emails-replies",
        {
                  headers: { Authorization: `Bearer ${token}` },
        }
            );

      return response.data || [];
    } catch (error) {
          console.error("[Snov.io] Failed to get replies:", error);
          return [];
    }
}

// ─── Get Snov.io Campaigns ────────────────────────────────────────────────────
export async function getSnovioCampaigns(
    snovioClientId: string,
    snovioClientSecret: string
  ): Promise<any[]> {
    try {
          const token = await getSnovioToken(snovioClientId, snovioClientSecret);

      const response = await axios.get(
              "https://api.snov.io/v1/get-user-campaigns",
        {
                  headers: { Authorization: `Bearer ${token}` },
        }
            );

      return response.data || [];
    } catch (error) {
          console.error("[Snov.io] Failed to get campaigns:", error);
          return [];
    }
}

// ─── Unified Send Function ────────────────────────────────────────────────────
export async function sendEmail(
    userId: number,
    emailId: number,
    accountId?: number
  ): Promise<SendResult> {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not available", provider: "none" };

  // Get the email to send
  const [email] = await db
      .select()
      .from(emailSequences)
      .where(and(eq(emailSequences.id, emailId), eq(emailSequences.userId, userId)))
      .limit(1);

  if (!email) return { success: false, error: "Email not found", provider: "none" };
    if (!email.subject || !email.body) return { success: false, error: "Email has no subject/body", provider: "none" };

  // Get the lead
  const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, email.leadId))
      .limit(1);

  if (!lead) return { success: false, error: "Lead not found", provider: "none" };

  // Get the email account to use
  let account;
    if (accountId) {
          [account] = await db
            .select()
            .from(emailAccounts)
            .where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.userId, userId)))
            .limit(1);
    } else {
          // Use default account
      [account] = await db
            .select()
            .from(emailAccounts)
            .where(and(eq(emailAccounts.userId, userId), eq(emailAccounts.isDefault, true)))
            .limit(1);

      // If no default, use first available
      if (!account) {
              [account] = await db
                .select()
                .from(emailAccounts)
                .where(eq(emailAccounts.userId, userId))
                .limit(1);
      }
    }

  if (!account) {
        return { success: false, error: "No email account configured. Please add an email account in Settings.", provider: "none" };
  }

  // Send based on provider
  let result: SendResult;

  const senderProfile = await getSenderProfile(userId);
    const htmlBody = formatEmailHtml(
          email.body,
          senderProfile?.emailSignature,
          senderProfile?.emailFontSize || 14,
          senderProfile?.emailFontFamily || 'Arial, sans-serif',
          (senderProfile as any)?.signatureLogoUrl || null
        );

  if (account.provider === "smtp" && account.smtpHost && account.smtpPort && account.smtpUser && account.smtpPass) {
        result = await sendViaSmtp(
          {
                    smtpHost: account.smtpHost,
                    smtpPort: account.smtpPort,
                    smtpUser: account.smtpUser,
                    smtpPass: account.smtpPass,
                    smtpSecure: account.smtpSecure,
                    email: account.email,
                    label: account.label,
          },
          {
                    to: lead.email,
                    subject: email.subject,
                    html: htmlBody,
                    text: `${email.body}${senderProfile?.emailSignature ? `\n\n${senderProfile.emailSignature}` : ''}`,
                    inReplyTo: email.gmailMessageId || undefined,
          }
              );
  } else if (account.provider === "snovio") {
        // Snov.io uses SMTP relay at smtp.snov.io:587
      // The user's Snov.io email account credentials work as SMTP auth
      const snovioSmtp = SMTP_PRESETS.snovio;
        result = await sendViaSmtp(
          {
                    smtpHost: account.smtpHost || snovioSmtp.host,
                    smtpPort: account.smtpPort || snovioSmtp.port,
                    smtpUser: account.smtpUser || account.email,
                    smtpPass: account.smtpPass || "",
                    smtpSecure: account.smtpSecure ?? snovioSmtp.secure,
                    email: account.email,
                    label: account.label,
          },
          {
                    to: lead.email,
                    subject: email.subject,
                    html: htmlBody,
                    text: `${email.body}${senderProfile?.emailSignature ? `\n\n${senderProfile.emailSignature}` : ''}`,
                    inReplyTo: email.gmailMessageId || undefined,
          }
              );
  } else {
        return { success: false, error: `Unsupported provider: ${account.provider}`, provider: account.provider };
  }

  // Update email status if sent successfully
  if (result.success) {
        const now = new Date();
        await db.update(emailSequences).set({
                status: "sent",
                sentAt: now,
                gmailMessageId: result.messageId || null,
        }).where(eq(emailSequences.id, emailId));

      // Update lead state
      await db.update(leadStates).set({
              currentState: "email_sent",
              lastSentAt: now,
              followUpDueAt: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48 hours later
              lastEmailType: email.emailType,
      }).where(and(eq(leadStates.userId, userId), eq(leadStates.leadId, email.leadId)));

      // Update lead status
      await db.update(leads).set({
              status: "contacted",
      }).where(eq(leads.id, email.leadId));
  }

  return result;
}

// ─── Batch Send Emails ────────────────────────────────────────────────────────
export async function batchSendEmails(
    userId: number,
    emailIds: number[],
    accountId?: number
  ): Promise<{ total: number; sent: number; failed: number; results: SendResult[] }> {
    const results: SendResult[] = [];
    let sent = 0;
    let failed = 0;
    const settings = await getAutomationSettings(userId);
    const delaySeconds = Math.max(180, settings?.sendDelaySeconds ?? 180);

  for (const emailId of emailIds) {
        if (results.length > 0) {
                await wait(delaySeconds * 1000);
        }

      const result = await sendEmail(userId, emailId, accountId);
        results.push(result);

      if (result.success) {
              sent++;
      } else {
              failed++;
      }
  }

  // Create notification about batch completion
  const db = await getDb();
    if (db) {
          await db.insert(notifications).values({
                  userId,
                  type: "batch_complete",
                  title: `批量发送完成：${sent} 封成功，${failed} 封失败`,
                  message: `共 ${emailIds.length} 封邮件，成功发送 ${sent} 封，失败 ${failed} 封。`,
                  isRead: false,
          });
    }

  return { total: emailIds.length, sent, failed, results };
}

// ─── Check for Follow-ups Due ─────────────────────────────────────────────────
export async function checkFollowUpsDue(userId: number): Promise<{
    dueLeads: Array<{ leadId: number; email: string; companyName: string | null; lastSentAt: Date | null; round: number }>;
}> {
    const db = await getDb();
    if (!db) return { dueLeads: [] };

  const now = new Date();

  const dueStates = await db
      .select({
              leadId: leadStates.leadId,
              lastSentAt: leadStates.lastSentAt,
              round: leadStates.currentRound,
              email: leads.email,
              companyName: leads.companyName,
      })
      .from(leadStates)
      .innerJoin(leads, eq(leads.id, leadStates.leadId))
      .where(
              and(
                        eq(leadStates.userId, userId),
                        eq(leadStates.autoFollowUpEnabled, true),
                        eq(leadStates.hasReply, false),
                        eq(leadStates.currentState, "email_sent")
                      )
            );

  // Filter those where followUpDueAt has passed
  const overdue = dueStates.filter((s) => {
        if (!s.lastSentAt) return false;
        const dueTime = new Date(s.lastSentAt.getTime() + 48 * 60 * 60 * 1000);
        return now >= dueTime;
  });

  return {
        dueLeads: overdue.map((s) => ({
                leadId: s.leadId,
                email: s.email,
                companyName: s.companyName,
                lastSentAt: s.lastSentAt,
                round: s.round,
        })),
  };
}

// ─── Check for Replies via IMAP ───────────────────────────────────────────────
// For SMTP accounts, we check replies by connecting via IMAP
// This is a simplified version - full IMAP would need imap library
export async function checkRepliesForUser(userId: number): Promise<{
    newReplies: Array<{ leadId: number; from: string; subject: string; snippet: string }>;
}> {
    // For now, this is handled by the frontend manual "has reply" button
  // Full IMAP integration would require additional setup per email provider
  // Snov.io replies are checked via their API
  return { newReplies: [] };
}

// ─── Common SMTP Presets ──────────────────────────────────────────────────────
export const SMTP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
    gmail: { host: "smtp.gmail.com", port: 465, secure: true },
    outlook: { host: "smtp.office365.com", port: 587, secure: false },
    yahoo: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    "163": { host: "smtp.163.com", port: 465, secure: true },
    qq: { host: "smtp.qq.com", port: 465, secure: true },
    zoho: { host: "smtp.zoho.com", port: 465, secure: true },
    icloud: { host: "smtp.mail.me.com", port: 587, secure: false },
    fastmail: { host: "smtp.fastmail.com", port: 465, secure: true },
    sendgrid: { host: "smtp.sendgrid.net", port: 465, secure: true },
    mailgun: { host: "smtp.mailgun.org", port: 465, secure: true },
    snovio: { host: "smtp.snov.io", port: 587, secure: false },
};
