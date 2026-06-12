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
import { SMTP_PRESETS } from "./email-account-setup";
import axios from "axios";

export { SMTP_PRESETS } from "./email-account-setup";

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
    hint?: string;
    provider: string;
    effectiveConfig?: Pick<SmtpConnectionConfig, "smtpHost" | "smtpPort" | "smtpSecure" | "smtpProxyUrl">;
    attempts?: SmtpAttemptSummary[];
}

export type SmtpConnectionConfig = {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpSecure: boolean;
    smtpProxyUrl?: string | null;
};

export type SmtpAttemptSummary = {
    host: string;
    port: number;
    secure: boolean;
    proxyUrl?: string | null;
    success: boolean;
    error?: string;
};

export type SmtpConnectionCheckResult = {
    success: boolean;
    error?: string;
    hint?: string;
    effectiveConfig?: Pick<SmtpConnectionConfig, "smtpHost" | "smtpPort" | "smtpSecure" | "smtpProxyUrl">;
    attempts: SmtpAttemptSummary[];
};

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

export function normalizeSmtpConnectionConfig(config: SmtpConnectionConfig): SmtpConnectionConfig {
    const smtpPort = Number(config.smtpPort) || 587;
    let smtpSecure = config.smtpSecure;

    if (smtpPort === 465) {
            smtpSecure = true;
    } else if (smtpPort === 587 || smtpPort === 25) {
            smtpSecure = false;
    }

    return {
            ...config,
            smtpPort,
            smtpSecure,
    };
}

function normalizeSmtpConfig(config: SmtpConnectionConfig): SmtpConnectionConfig {
    const normalizedConfig = normalizeSmtpConnectionConfig(config);
    const isGmail =
            /(^|\.)gmail\.com$/i.test(normalizedConfig.smtpHost) ||
            /@gmail\.com$/i.test(normalizedConfig.smtpUser);
    return {
            ...normalizedConfig,
            smtpPass: isGmail ? normalizedConfig.smtpPass.replace(/\s+/g, "") : normalizedConfig.smtpPass,
    };
}

function createSmtpTransport(config: SmtpConnectionConfig): Transporter {
    const normalized = normalizeSmtpConfig(config);
    return nodemailer.createTransport({
            host: normalized.smtpHost,
            port: normalized.smtpPort,
            secure: normalized.smtpSecure,
            proxy: normalized.smtpProxyUrl || undefined,
            auth: {
                      user: normalized.smtpUser,
                      pass: normalized.smtpPass,
            },
            requireTLS: !normalized.smtpSecure,
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 30000,
            tls: {
                      rejectUnauthorized: false,
                      servername: normalized.smtpHost,
            },
    } as any);
}

function getProxyCandidates(config: SmtpConnectionConfig): Array<string | null> {
    const candidates = [
            null,
            config.smtpProxyUrl || null,
            process.env.ALL_PROXY || null,
            process.env.HTTPS_PROXY || null,
            process.env.HTTP_PROXY || null,
            "http://127.0.0.1:2340",
            "http://127.0.0.1:7890",
            "http://127.0.0.1:7891",
    ];
    return candidates.filter((candidate, index, list) =>
            index === list.findIndex(item => item === candidate)
    );
}

export function buildSmtpConnectionAttempts(config: SmtpConnectionConfig): SmtpConnectionConfig[] {
    const normalized = normalizeSmtpConnectionConfig(config);
    const portAttempts: SmtpConnectionConfig[] = [normalized];
    const add = (candidate: SmtpConnectionConfig) => {
            if (!portAttempts.some(item =>
                    item.smtpHost === candidate.smtpHost &&
                    item.smtpPort === candidate.smtpPort &&
                    item.smtpSecure === candidate.smtpSecure
            )) {
                    portAttempts.push(candidate);
            }
    };

    if (normalized.smtpPort === 465 && normalized.smtpSecure) {
            add({ ...normalized, smtpPort: 587, smtpSecure: false });
    } else if (normalized.smtpPort === 587 && !normalized.smtpSecure) {
            add({ ...normalized, smtpPort: 465, smtpSecure: true });
    }

    const attempts: SmtpConnectionConfig[] = [];
    for (const proxyUrl of getProxyCandidates(normalized)) {
            for (const attempt of portAttempts) {
                    attempts.push({ ...attempt, smtpProxyUrl: proxyUrl });
            }
    }

    return attempts;
}

function isAuthErrorMessage(message: string) {
    return /auth|authentication|credentials|password|535|5\.7\.8|Username and Password not accepted/i.test(message);
}

function isConnectionErrorMessage(message: string) {
    return /ECONNREFUSED|ETIMEDOUT|ECONNECTION|Unexpected socket close|socket disconnected|secure TLS|timeout|network|connect/i.test(message);
}

function formatRawSmtpError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || "SMTP failed");
    if (/ECONNREFUSED\s+127\.0\.0\.1:\d+/i.test(message)) {
            return "本机代理端口拒绝连接";
    }
    if (/Unexpected socket close|socket disconnected/i.test(message)) {
            return "连接被远端网络关闭";
    }
    return message;
}

export function getSmtpFailureSummary(
    error: unknown,
    attempts: SmtpAttemptSummary[] = [],
): { hint: string; error: string } {
    const messages = attempts.map(attempt => attempt.error || "").filter(Boolean);
    const lastMessage = error instanceof Error ? error.message : String(error || "");

    if (messages.some(isAuthErrorMessage) || isAuthErrorMessage(lastMessage)) {
            return {
                    hint: "认证失败：请确认填写的是应用密码/授权码，不是邮箱登录密码，并确认 SMTP 服务已开启。",
                    error: formatRawSmtpError(error),
            };
    }

    const proxyRefused = messages.some(message => /ECONNREFUSED\s+127\.0\.0\.1:\d+/i.test(message)) ||
            /ECONNREFUSED\s+127\.0\.0\.1:\d+/i.test(lastMessage);
    const allNetwork = attempts.length > 0 && attempts.every(attempt => isConnectionErrorMessage(attempt.error || ""));

    if (proxyRefused && allNetwork) {
            return {
                    hint: "当前网络或本机代理无法连接 SMTP。软件已经尝试直连、465/SSL、587/STARTTLS 和常见本机代理端口；请切换网络或代理节点后再发送测试邮件。",
                    error: "所有连接尝试均失败，最后一个本机代理端口不可用。",
            };
    }

    if (allNetwork || isConnectionErrorMessage(lastMessage)) {
            return {
                    hint: "网络连接失败：请检查网络、代理、防火墙，或切换 465/SSL 与 587/STARTTLS 后再试。",
                    error: formatRawSmtpError(error),
            };
    }

    return {
            hint: getSmtpErrorHint(error),
            error: formatRawSmtpError(error),
    };
}

export function getSmtpErrorHint(error: unknown): string {
    const err = error as { code?: string; command?: string; responseCode?: number; message?: string };
    const message = err?.message || "";

    if (err?.code === "EAUTH" || err?.responseCode === 535 || isAuthErrorMessage(message)) {
            return "认证失败：请确认填写的是应用密码/授权码，并且 SMTP 服务已开启。";
    }
    if (/TLS|secure TLS|SSL|handshake|socket disconnected/i.test(message)) {
            return "TLS 握手失败：当前网络或端口可能阻断了 SSL 连接，系统会尝试 587/STARTTLS 和本机代理；如果仍失败，请检查代理或防火墙。";
    }
    if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || /timeout|network|connect/i.test(message)) {
            return "网络连接失败：请检查网络、代理、防火墙，或尝试切换 465/SSL 与 587/STARTTLS。";
    }
    return "SMTP 验证失败：请检查服务器、端口、加密方式、用户名和应用密码/授权码。";
}

// ─── SMTP Sender ──────────────────────────────────────────────────────────────
export async function sendViaSmtp(
    accountConfig: SmtpConnectionConfig & {
          email: string;
          label: string;
    },
    params: SendEmailParams
  ): Promise<SendResult> {
    let lastError: unknown = null;
    const summaries: SmtpAttemptSummary[] = [];
    const attempts = accountConfig.smtpProxyUrl
      ? [normalizeSmtpConnectionConfig(accountConfig)]
      : buildSmtpConnectionAttempts(accountConfig);

    for (const attempt of attempts) {
    try {
          const transporter = createSmtpTransport(attempt);

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
              effectiveConfig: {
                      smtpHost: attempt.smtpHost,
                      smtpPort: attempt.smtpPort,
                      smtpSecure: attempt.smtpSecure,
                      smtpProxyUrl: attempt.smtpProxyUrl || null,
              },
              attempts: [
                      ...summaries,
                      {
                              host: attempt.smtpHost,
                              port: attempt.smtpPort,
                              secure: attempt.smtpSecure,
                              proxyUrl: attempt.smtpProxyUrl || null,
                              success: true,
                      },
              ],
      };
    } catch (error: any) {
          lastError = error;
          summaries.push({
                  host: attempt.smtpHost,
                  port: attempt.smtpPort,
                  secure: attempt.smtpSecure,
                  proxyUrl: attempt.smtpProxyUrl || null,
                  success: false,
                  error: error.message || "SMTP send failed",
          });
    }
    }

    const error = lastError as Error | null;
    const failure = getSmtpFailureSummary(error, summaries);
    return {
            success: false,
            error: failure.error,
            hint: failure.hint,
            provider: "smtp",
            attempts: summaries,
    };
    }

// ─── Verify SMTP Connection ───────────────────────────────────────────────────
export async function verifySmtp(config: SmtpConnectionConfig): Promise<SmtpConnectionCheckResult> {
    const attempts: SmtpAttemptSummary[] = [];
    let lastError: unknown = null;

    for (const attempt of buildSmtpConnectionAttempts(config)) {
          try {
                const transporter = createSmtpTransport(attempt);
                await transporter.verify();
                attempts.push({
                        host: attempt.smtpHost,
                        port: attempt.smtpPort,
                        secure: attempt.smtpSecure,
                        proxyUrl: attempt.smtpProxyUrl || null,
                        success: true,
                });
                return {
                        success: true,
                        effectiveConfig: {
                                smtpHost: attempt.smtpHost,
                                smtpPort: attempt.smtpPort,
                                smtpSecure: attempt.smtpSecure,
                                smtpProxyUrl: attempt.smtpProxyUrl || null,
                        },
                        attempts,
                };
          } catch (error: any) {
                lastError = error;
                attempts.push({
                        host: attempt.smtpHost,
                        port: attempt.smtpPort,
                        secure: attempt.smtpSecure,
                        proxyUrl: attempt.smtpProxyUrl || null,
                        success: false,
                        error: error.message || "SMTP verify failed",
                });
          }
    }

    const failure = getSmtpFailureSummary(lastError, attempts);
    return {
            success: false,
            error: failure.error,
            hint: failure.hint,
            attempts,
    };
}

export const verifySMTP = verifySmtp;

export async function sendSmtpTestEmail(config: SmtpConnectionConfig & {
    email: string;
    label?: string;
    testTo?: string;
}): Promise<SmtpConnectionCheckResult & { messageId?: string; testTo?: string }> {
    const testTo = config.testTo || config.email;
    const now = new Date();
    const sendResult = await sendViaSmtp(
            {
                    smtpHost: config.smtpHost,
                    smtpPort: config.smtpPort,
                    smtpSecure: config.smtpSecure,
                    smtpProxyUrl: config.smtpProxyUrl || null,
                    smtpUser: config.smtpUser,
                    smtpPass: config.smtpPass,
                    email: config.email,
                    label: config.label || "Letter App",
            },
            {
                    to: testTo,
                    subject: `Letter App SMTP 测试邮件 - ${now.toLocaleString("zh-CN")}`,
                    html: `<p>这是一封来自 Letter App 的 SMTP 测试邮件。</p><p>如果你收到它，说明该邮箱可以正常发信。</p><p>发送时间：${now.toLocaleString("zh-CN")}</p>`,
                    text: `这是一封来自 Letter App 的 SMTP 测试邮件。\n如果你收到它，说明该邮箱可以正常发信。\n发送时间：${now.toLocaleString("zh-CN")}`,
            }
    );

    if (!sendResult.success) {
            return {
                    success: false,
                    error: sendResult.error,
                    hint: sendResult.hint || "SMTP 已连接，但测试邮件发送失败。",
                    attempts: sendResult.attempts || [],
                    testTo,
            };
    }

    return {
            success: true,
            effectiveConfig: sendResult.effectiveConfig,
            attempts: sendResult.attempts || [],
            messageId: sendResult.messageId,
            testTo,
    };
}

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

  if (account.smtpHost && account.smtpPort && account.smtpUser && account.smtpPass) {
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

