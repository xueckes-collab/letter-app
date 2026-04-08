import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getSchedulerHealth } from "./services/scheduler";
import {
  getSenderProfile, upsertSenderProfile, createSenderAsset,
  createLead, getLeadsByUser, getLeadById, getLeadWithRelations,
  saveWebsiteAnalysis, saveIcpMatch, saveUspMatch,
  createEmailSequence, updateEmailSequence, getEmailsByLead,
  createReplyAnalysis, getLeadState, upsertLeadState,
  updateLeadStatus, updateLeadCompanyInfo,
  createNotification, getNotifications, getUnreadNotificationCount,
  markNotificationRead, markAllNotificationsRead,
  getLeadsReadyForFollowUp, markEmailSent, getLatestSentEmail,
  getLeadsByIds, getAllUsers,
  createEmailAccount, getEmailAccountsByUser, getEmailAccountById,
  getDefaultEmailAccount, updateEmailAccount, deleteEmailAccount,
  getDraftEmailsForLeads,
  getAutomationSettings, upsertAutomationSettings,
  createFeedback, getFeedbacksByUser, getAllFeedbacks,
  updateFeedbackAnalysis, deleteFeedback,
} from "./db";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { scrapeWebsite, formatScrapingResults } from "./services/scraper";
import { analyzeWebsite, matchICP, matchUSP, generateEmail, analyzeReply } from "./services/llm-engine";
import { getStrategyForRound } from "./services/follow-up-strategies";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { validateSnovioCredentials, domainSearch } from "./services/snovio";
import { sendEmail, batchSendEmails, verifySMTP, SMTP_PRESETS } from "./services/email-sender";

// Helper: build sender context string for LLM
async function buildSenderContext(userId: number): Promise<string> {
  const profile = await getSenderProfile(userId);
  if (!profile) return "No sender profile configured yet.";
  let ctx = `Company: ${profile.companyName}\nWebsite: ${profile.website}\nProducts: ${profile.mainProducts}\nAdvantages: ${profile.coreAdvantages}\nCertifications: ${profile.certifications}\nMOQ/Lead Time: ${profile.moqLeadTime}\nSample Policy: ${profile.samplePolicy}\nCustomization: ${profile.customization}`;
  if (profile.assets?.length) {
    ctx += "\n\nUploaded Asset Summaries:\n";
    for (const asset of profile.assets) {
      if (asset.extractedText) ctx += `- ${asset.fileName}: ${asset.extractedText.substring(0, 500)}\n`;
    }
  }
  return ctx;
}

function buildThinkingCards(steps: Array<{ title: string; items: string[] }>) {
  return steps.map((step, i) => ({ id: `step-${i}`, title: step.title, items: step.items }));
}

// Helper: process a single lead through the full analysis + email generation pipeline
async function processLeadPipeline(leadId: number, userId: number, email: string, website: string, contactName?: string | null) {
  const scrapeResult = await scrapeWebsite(website);
  const scrapedText = formatScrapingResults(scrapeResult);
  const senderContext = await buildSenderContext(userId);

  const waResult = await analyzeWebsite(scrapedText, senderContext);
  await saveWebsiteAnalysis({
    userId, leadId,
    industry: waResult.industry, businessModel: waResult.businessModel,
    productFocus: waResult.productFocus, marketPosition: waResult.marketPosition,
    websiteSignals: waResult.websiteSignals, purchaseIntentScore: waResult.purchaseIntentScore,
    triggerEvents: waResult.triggerEvents, rawSummary: waResult.rawSummary,
  });

  if (waResult.companyName || waResult.country) {
    await updateLeadCompanyInfo(leadId, waResult.companyName || '', waResult.country || '');
  }

  const icpResult = await matchICP(waResult, senderContext);
  await saveIcpMatch({
    userId, leadId,
    icpName: icpResult.icpName, buyerRoles: icpResult.buyerRoles,
    painPoints: icpResult.painPoints, triggers: icpResult.triggers,
    decisionStyle: icpResult.decisionStyle, salesAngles: icpResult.salesAngles,
  });

  const uspResult = await matchUSP(waResult, icpResult, senderContext);
  await saveUspMatch({
    userId, leadId,
    primaryUsp: uspResult.primaryUsp, secondaryUsp: uspResult.secondaryUsp,
    whyFit: uspResult.whyFit, proofPoints: uspResult.proofPoints, emailAngle: uspResult.emailAngle,
  });

  const emailResult = await generateEmail({
    type: 'warm',
    websiteAnalysis: waResult, icpMatch: icpResult, uspMatch: uspResult,
    senderContext, contactName: contactName || undefined,
  });

  const emailId = await createEmailSequence({
    userId, leadId, emailType: 'warm',
    subject: emailResult.subject, body: emailResult.body,
    strategyType: 'initial_warm', stageNumber: 0,
    thinkingSummary: [
      { title: 'Website Analysis', items: [waResult.rawSummary, `Industry: ${waResult.industry}`, `Intent Score: ${waResult.purchaseIntentScore}/10`] },
      { title: 'ICP Match', items: [`Type: ${icpResult.icpName}`, `Pain Points: ${(icpResult.painPoints || []).join(', ')}`] },
      { title: 'USP Selection', items: [`Primary: ${uspResult.primaryUsp}`, `Why: ${uspResult.whyFit}`] },
    ],
    status: 'draft',
  });

  await upsertLeadState(leadId, userId, {
    currentState: 'waiting_user_send', currentRound: 0,
    lastEmailType: 'warm', nextAction: 'Send the warm email to the prospect',
  });
  await updateLeadStatus(leadId, 'email_drafted', 'blue', 'not_checked');

  return { emailId, emailResult, waResult, icpResult, uspResult };
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
 

    // Manually update email content (title and body)
    updateEmailContent: protectedProcedure
      .input(z.object({
        emailId: z.number(),
        subject: z.string().optional(),
        body: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateEmailSequence(input.emailId, {
          subject: input.subject,
          body: input.body,
        });
        return { success: true };
      }),
 }),

  // ============================================================
  // SENDER PROFILE
  // ============================================================
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getSenderProfile(ctx.user.id);
    }),

    save: protectedProcedure
      .input(z.object({
        companyName: z.string().min(1),
        website: z.string().optional().default(""),
        mainProducts: z.string().optional(),
        coreAdvantages: z.string().optional(),
        certifications: z.string().optional(),
        moqLeadTime: z.string().optional(),
        samplePolicy: z.string().optional(),
        customization: z.string().optional(),
        onboardingComplete: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await upsertSenderProfile(ctx.user.id, input);
        return { success: true, profileId: id };
      }),

    uploadAsset: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        mimeType: z.string().optional(),
        fileSize: z.number().optional(),
        fileBase64: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const profile = await getSenderProfile(ctx.user.id);
        if (!profile) throw new Error("Please complete your profile first");
        const buffer = Buffer.from(input.fileBase64, 'base64');
        const fileKey = `sender-assets/${ctx.user.id}/${nanoid()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType || 'application/octet-stream');

        let extractedText: string | null = null;
        try {
          const { invokeLLM } = await import("./_core/llm");
          const mimeType = input.mimeType || 'application/octet-stream';
          const isImage = mimeType.startsWith('image/');
          const isPdf = mimeType === 'application/pdf';
          if (isImage || isPdf) {
            const result = await invokeLLM({
              messages: [
                { role: "system", content: "Extract all text content from this document. Return the raw text only." },
                { role: "user", content: [
                  { type: "text", text: `Extract text from this ${isPdf ? 'PDF' : 'image'} file: ${input.fileName}` },
                  ...(isImage ? [{ type: "image_url" as const, image_url: { url } }] : [{ type: "file_url" as const, file_url: { url, mime_type: "application/pdf" as const } }]),
                ]},
              ],
            });
            extractedText = result.choices[0]?.message?.content as string || null;
          }
        } catch (e) {
          console.warn("[Asset] Text extraction failed:", e);
        }

        const assetId = await createSenderAsset({
          userId: ctx.user.id, senderProfileId: profile.id,
          fileName: input.fileName, mimeType: input.mimeType || null,
          fileSize: input.fileSize || null, fileUrl: url, fileKey, extractedText,
        });
        return { success: true, assetId, url };
      }),

    // Email signature and formatting
    getEmailSettings: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getSenderProfile(ctx.user.id);
      return {
        signature: (profile as any)?.emailSignature || '',
        fontSize: (profile as any)?.emailFontSize || 14,
        fontFamily: (profile as any)?.emailFontFamily || 'Arial, sans-serif',
      };
    }),

    updateEmailSettings: protectedProcedure
      .input(z.object({
        signature: z.string().optional(),
        fontSize: z.number().min(10).max(24).optional(),
        fontFamily: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertSenderProfile(ctx.user.id, {
          emailSignature: input.signature,
          emailFontSize: input.fontSize,
          emailFontFamily: input.fontFamily,
        } as any);
        return { success: true };
      }),
  }),

  // ============================================================
  // LEADS
  // ============================================================
  leads: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getLeadsByUser(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ ctx, input }) => {
        return getLeadWithRelations(input.leadId, ctx.user.id);
      }),

    create: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        website: z.string().min(1),
        contactName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const leadId = await createLead({
          userId: ctx.user.id, email: input.email, website: input.website,
          contactName: input.contactName || null, source: 'manual',
          status: 'new', replyStatus: 'not_checked', statusColor: 'slate',
        });

        const result = await processLeadPipeline(leadId, ctx.user.id, input.email, input.website, input.contactName);
        const state = await getLeadState(leadId);
        const lead = await getLeadById(leadId, ctx.user.id);

        return {
          lead, state,
          email: { id: result.emailId, subject: result.emailResult.subject, body: result.emailResult.body, type: 'warm', round: 0 },
          thinkingCards: buildThinkingCards([
            { title: '🌐 网站分析', items: [result.waResult.rawSummary, `行业: ${result.waResult.industry}`, `购买意向: ${result.waResult.purchaseIntentScore}/10`] },
            { title: '🎯 ICP 匹配', items: [`类型: ${result.icpResult.icpName}`, `痛点: ${(result.icpResult.painPoints || []).join(', ')}`] },
            { title: '💎 USP 选择', items: [`主打: ${result.uspResult.primaryUsp}`, `原因: ${result.uspResult.whyFit}`] },
            { title: '✉️ 邮件策略', items: [result.emailResult.strategyNotes] },
          ]),
        };
      }),

    bulkImport: protectedProcedure
      .input(z.object({ rows: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const lines = input.rows.split('\n').filter(l => l.trim());
        let successCount = 0;
        let failedCount = 0;
        const batchId = nanoid(8);
        const importedLeadIds: number[] = [];

        for (const line of lines) {
          try {
            const parts = line.split(/[,\t]/).map(s => s.trim());
            const email = parts.find(p => p.includes('@')) || '';
            const website = parts.find(p => p.includes('.') && !p.includes('@')) || '';
            const contactName = parts.find(p => !p.includes('@') && !p.includes('.')) || '';
            if (!email || !website) { failedCount++; continue; }
            const leadId = await createLead({
              userId: ctx.user.id, email, website, contactName: contactName || null,
              importBatchId: batchId, source: 'bulk',
              status: 'new', replyStatus: 'not_checked', statusColor: 'slate',
            });
            importedLeadIds.push(leadId);
            successCount++;
          } catch { failedCount++; }
        }
        return { successCount, failedCount, batchId, importedLeadIds };
      }),
  }),

  // ============================================================
  // BATCH OPERATIONS
  // ============================================================
  batch: router({
    // Generate emails for multiple leads at once
    generateEmails: protectedProcedure
      .input(z.object({ leadIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        const results: Array<{ leadId: number; success: boolean; error?: string }> = [];
        let processed = 0;

        for (const leadId of input.leadIds) {
          try {
            const lead = await getLeadById(leadId, ctx.user.id);
            if (!lead) { results.push({ leadId, success: false, error: 'Lead not found' }); continue; }

            // Check if already has email
            const existing = await getEmailsByLead(leadId);
            if (existing.length > 0) { results.push({ leadId, success: true, error: 'Already has email' }); continue; }

            await processLeadPipeline(leadId, ctx.user.id, lead.email, lead.website, lead.contactName);
            results.push({ leadId, success: true });
            processed++;
          } catch (e: any) {
            results.push({ leadId, success: false, error: e.message?.substring(0, 100) });
          }
        }

        // Notify user
        await createNotification({
          userId: ctx.user.id, type: 'batch_complete',
          title: `批量生成完成`,
          message: `已为 ${processed} 个客户生成开发信，共 ${input.leadIds.length} 个客户`,
          actionUrl: '/leads',
        });

        return { total: input.leadIds.length, processed, results };
      }),

    // Send emails via configured email account (SMTP/Snov.io)
    sendEmails: protectedProcedure
      .input(z.object({
        emailIds: z.array(z.number()),
        accountId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user has email account configured
        const account = input.accountId
          ? await getEmailAccountById(input.accountId, ctx.user.id)
          : await getDefaultEmailAccount(ctx.user.id);

        if (!account) {
          throw new Error('请先在「邮箱设置」中配置发件邮箱');
        }

        const result = await batchSendEmails(ctx.user.id, input.emailIds, input.accountId);
        return result;
      }),

    // Get draft emails ready for sending (for batch send confirmation)
    getDraftEmails: protectedProcedure
      .input(z.object({ leadIds: z.array(z.number()) }))
      .query(async ({ ctx, input }) => {
        return getDraftEmailsForLeads(input.leadIds, ctx.user.id);
      }),

    // Get leads that need follow-up (48h passed)
    getFollowUpDue: protectedProcedure.query(async ({ ctx }) => {
      return getLeadsReadyForFollowUp(ctx.user.id);
    }),

        // Import pre-parsed leads from Excel file
    excelBulkImportParsed: protectedProcedure
      .input(z.object({
        leads: z.array(z.object({
          name: z.string(),
          company: z.string().optional().default(''),
          email: z.string(),
          website: z.string().optional().default(''),
          title: z.string().optional().default(''),
          phone: z.string().optional().default(''),
          notes: z.string().optional().default(''),
        })),
        autoGenerate: z.boolean().optional().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const results = [];
        for (const lead of input.leads) {
          try {
            const newLead = await createLead({
              userId: ctx.user.id,
              name: lead.name,
              company: lead.company || '',
              email: lead.email,
              website: lead.website || '',
              title: lead.title || '',
              phone: lead.phone || '',
              status: 'active',
            });
            results.push({ success: true, leadId: newLead.id, email: lead.email });
          } catch (err: any) {
            results.push({ success: false, email: lead.email, error: err.message });
          }
        }
        return {
          imported: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results
        };
      }),

// Generate follow-up emails for multiple leads
    generateFollowUps: protectedProcedure
      .input(z.object({ leadIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        const results: Array<{ leadId: number; success: boolean; emailId?: number; error?: string }> = [];

        for (const leadId of input.leadIds) {
          try {
            const data = await getLeadWithRelations(leadId, ctx.user.id);
            if (!data) { results.push({ leadId, success: false, error: 'Lead not found' }); continue; }

            const currentState = data.leadState;
            const nextRound = (currentState?.currentRound || 0) + 1;
            const strategy = getStrategyForRound(nextRound);
            const senderContext = await buildSenderContext(ctx.user.id);

            const previousEmails = data.emailSequences.map(e => ({
              subject: e.subject || '', body: e.body || '', type: e.emailType,
            }));

            const emailResult = await generateEmail({
              type: 'followup',
              websiteAnalysis: (data.websiteAnalysis || {}) as Record<string, unknown>,
              icpMatch: (data.icpMatch || {}) as Record<string, unknown>,
              uspMatch: (data.uspMatch || {}) as Record<string, unknown>,
              senderContext, contactName: data.lead.contactName || undefined,
              round: nextRound, previousEmails,
              followupStrategy: strategy ? (strategy as unknown as Record<string, unknown>) : undefined,
            });

            const emailId = await createEmailSequence({
              userId: ctx.user.id, leadId, emailType: 'followup',
              subject: emailResult.subject, body: emailResult.body,
              strategyType: strategy?.name || `Round ${nextRound}`, stageNumber: nextRound,
              thinkingSummary: [
                { title: `Round ${nextRound}: ${strategy?.nameZh || 'Follow-up'}`, items: [strategy?.description || '', emailResult.strategyNotes] },
              ],
              status: 'draft',
            });

            await upsertLeadState(leadId, ctx.user.id, {
              currentState: 'waiting_user_send_followup', currentRound: nextRound,
              lastEmailType: 'followup', nextAction: `Send round ${nextRound} follow-up email`,
            });
            await updateLeadStatus(leadId, 'followup_drafted', 'amber', 'not_checked');

            results.push({ leadId, success: true, emailId });
          } catch (e: any) {
            results.push({ leadId, success: false, error: e.message?.substring(0, 100) });
          }
        }

        await createNotification({
          userId: ctx.user.id, type: 'batch_complete',
          title: '跟进邮件生成完成',
          message: `已为 ${results.filter(r => r.success).length} 个客户生成跟进信`,
          actionUrl: '/leads',
        });

        return { total: input.leadIds.length, generated: results.filter(r => r.success).length, results };
      }),
  }),

  // ============================================================
  // NOTIFICATIONS
  // ============================================================
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getNotifications(ctx.user.id);
    }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return getUnreadNotificationCount(ctx.user.id);
    }),

    markRead: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.notificationId, ctx.user.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),

    schedulerHealth: protectedProcedure.query(() => {
      return getSchedulerHealth();
    }),
  }),

  // ============================================================
  // SNOVIO
  // ============================================================
  snovio: router({
    validateCredentials: protectedProcedure.query(async () => {
      return validateSnovioCredentials();
    }),

    domainSearch: protectedProcedure
      .input(z.object({ domain: z.string() }))
      .mutation(async ({ input }) => {
        return domainSearch(input.domain);
      }),
  }),

  // ============================================================
  // EMAIL ACCOUNTS
  // ============================================================
  emailAccounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getEmailAccountsByUser(ctx.user.id);
    }),

    getPresets: publicProcedure.query(() => {
      return Object.entries(SMTP_PRESETS).map(([key, val]) => ({
        key, label: key.charAt(0).toUpperCase() + key.slice(1),
        host: val.host, port: val.port, secure: val.secure,
      }));
    }),

    create: protectedProcedure
      .input(z.object({
        provider: z.string(),
        label: z.string().min(1),
        email: z.string().email(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        smtpSecure: z.boolean().optional(),
        imapHost: z.string().optional(),
        imapPort: z.number().optional(),
        imapSecure: z.boolean().optional(),
        snovioClientId: z.string().optional(),
        snovioClientSecret: z.string().optional(),
        isDefault: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createEmailAccount({
          userId: ctx.user.id,
          provider: input.provider,
          label: input.label,
          email: input.email,
          smtpHost: input.smtpHost || null,
          smtpPort: input.smtpPort || null,
          smtpUser: input.smtpUser || null,
          smtpPass: input.smtpPass || null,
          smtpSecure: input.smtpSecure ?? true,
          imapHost: input.imapHost || null,
          imapPort: input.imapPort || null,
          imapSecure: input.imapSecure ?? true,
          snovioClientId: input.snovioClientId || null,
          snovioClientSecret: input.snovioClientSecret || null,
          isDefault: input.isDefault ?? false,
        });
        return { success: true, id };
      }),

    update: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        label: z.string().optional(),
        email: z.string().email().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        smtpSecure: z.boolean().optional(),
        isDefault: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accountId, ...data } = input;
        await updateEmailAccount(accountId, ctx.user.id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteEmailAccount(input.accountId, ctx.user.id);
        return { success: true };
      }),

    verify: protectedProcedure
      .input(z.object({
        smtpHost: z.string(),
        smtpPort: z.number(),
        smtpUser: z.string(),
        smtpPass: z.string(),
        smtpSecure: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        return verifySMTP(input);
      }),

    setDefault: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await updateEmailAccount(input.accountId, ctx.user.id, { isDefault: true });
        return { success: true };
      }),
  }),

  // ============================================================
  // WORKFLOW (single lead operations)
  // ============================================================
  workflow: router({
    loadLead: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ ctx, input }) => {
        const data = await getLeadWithRelations(input.leadId, ctx.user.id);
        if (!data) throw new Error("Lead not found");

        const timeline: Array<Record<string, unknown>> = [];
        for (const email of data.emailSequences) {
          const thinking = email.thinkingSummary as Array<{ title: string; items: string[] }> | null;
          if (thinking) {
            timeline.push({ id: `thinking-${email.id}`, kind: 'thinking', title: `${email.emailType} 思考流程`, cards: thinking });
          }
          timeline.push({
            id: String(email.id), kind: 'email',
            email: {
              id: email.id, subject: email.subject, body: email.body,
              type: email.emailType, round: email.stageNumber,
              status: email.status, sentAt: email.sentAt,
            },
          });
        }

        return { lead: data.lead, state: data.leadState, timeline };
      }),

    markSent: protectedProcedure
      .input(z.object({ leadId: z.number(), emailId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.emailId) {
          await markEmailSent(input.emailId);
        }
        const followUpDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await upsertLeadState(input.leadId, ctx.user.id, {
          currentState: 'waiting_response_status',
          lastSentAt: new Date(),
          followUpDueAt,
          nextAction: 'Wait for prospect response. Auto follow-up in 48h.',
        });
        await updateLeadStatus(input.leadId, 'email_sent', 'blue', 'not_checked');
        return { state: await getLeadState(input.leadId) };
      }),

    regenerateEmail: protectedProcedure
      .input(z.object({ leadId: z.number(), emailId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const data = await getLeadWithRelations(input.leadId, ctx.user.id);
        if (!data) throw new Error("Lead not found");
        const senderContext = await buildSenderContext(ctx.user.id);

        const emailResult = await generateEmail({
          type: 'warm',
          websiteAnalysis: (data.websiteAnalysis || {}) as Record<string, unknown>,
          icpMatch: (data.icpMatch || {}) as Record<string, unknown>,
          uspMatch: (data.uspMatch || {}) as Record<string, unknown>,
          senderContext, contactName: data.lead.contactName || undefined,
        });

        await updateEmailSequence(input.emailId, { subject: emailResult.subject, body: emailResult.body });

        return {
          email: { id: input.emailId, subject: emailResult.subject, body: emailResult.body, type: 'warm', round: 0 },
          thinkingCards: buildThinkingCards([{ title: '🔄 重新生成', items: [emailResult.strategyNotes] }]),
        };
      }),

    generateFollowup: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const data = await getLeadWithRelations(input.leadId, ctx.user.id);
        if (!data) throw new Error("Lead not found");

        const currentState = data.leadState;
        const nextRound = (currentState?.currentRound || 0) + 1;
        const strategy = getStrategyForRound(nextRound);
        const senderContext = await buildSenderContext(ctx.user.id);

        const previousEmails = data.emailSequences.map(e => ({
          subject: e.subject || '', body: e.body || '', type: e.emailType,
        }));

        const emailResult = await generateEmail({
          type: 'followup',
          websiteAnalysis: (data.websiteAnalysis || {}) as Record<string, unknown>,
          icpMatch: (data.icpMatch || {}) as Record<string, unknown>,
          uspMatch: (data.uspMatch || {}) as Record<string, unknown>,
          senderContext, contactName: data.lead.contactName || undefined,
          round: nextRound, previousEmails,
          followupStrategy: strategy ? (strategy as unknown as Record<string, unknown>) : undefined,
        });

        const emailId = await createEmailSequence({
          userId: ctx.user.id, leadId: input.leadId, emailType: 'followup',
          subject: emailResult.subject, body: emailResult.body,
          strategyType: strategy?.name || `Round ${nextRound}`, stageNumber: nextRound,
          thinkingSummary: [
            { title: `Round ${nextRound}: ${strategy?.nameZh || 'Follow-up'}`, items: [strategy?.description || '', emailResult.strategyNotes] },
          ],
          status: 'draft',
        });

        await upsertLeadState(input.leadId, ctx.user.id, {
          currentState: 'waiting_user_send_followup', currentRound: nextRound,
          lastEmailType: 'followup', nextAction: `Send round ${nextRound} follow-up email`,
        });
        await updateLeadStatus(input.leadId, 'followup_drafted', 'amber', 'not_checked');

        return {
          email: { id: emailId, subject: emailResult.subject, body: emailResult.body, type: 'followup', round: nextRound },
          state: await getLeadState(input.leadId),
          thinkingCards: buildThinkingCards([
            { title: `📧 第 ${nextRound} 轮: ${strategy?.nameZh || 'Follow-up'}`, items: [strategy?.description || '', emailResult.strategyNotes] },
          ]),
        };
      }),

    analyzeReply: protectedProcedure
      .input(z.object({ leadId: z.number(), replyContent: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const data = await getLeadWithRelations(input.leadId, ctx.user.id);
        if (!data) throw new Error("Lead not found");
        const senderContext = await buildSenderContext(ctx.user.id);

        const previousEmails = data.emailSequences.map(e => ({
          subject: e.subject || '', body: e.body || '', type: e.emailType,
        }));

        const replyResult = await analyzeReply(input.replyContent, {
          websiteAnalysis: (data.websiteAnalysis || {}) as Record<string, unknown>,
          icpMatch: (data.icpMatch || {}) as Record<string, unknown>,
          previousEmails,
        });

        await createReplyAnalysis({
          userId: ctx.user.id, leadId: input.leadId,
          originalReply: input.replyContent, replyType: replyResult.replyType,
          explicitNeeds: replyResult.explicitNeeds, hiddenConcerns: replyResult.hiddenConcerns,
          recommendedNextAction: replyResult.recommendedNextAction,
          thinkingSummary: [
            { title: '回复分析', items: [`类型: ${replyResult.replyType}`, `建议: ${replyResult.recommendedNextAction}`] },
          ],
        });

        const emailResult = await generateEmail({
          type: 'reply',
          websiteAnalysis: (data.websiteAnalysis || {}) as Record<string, unknown>,
          icpMatch: (data.icpMatch || {}) as Record<string, unknown>,
          uspMatch: (data.uspMatch || {}) as Record<string, unknown>,
          senderContext, contactName: data.lead.contactName || undefined,
          previousEmails, replyContent: input.replyContent, replyAnalysis: replyResult,
        });

        const emailId = await createEmailSequence({
          userId: ctx.user.id, leadId: input.leadId, emailType: 'reply',
          subject: emailResult.subject, body: emailResult.body,
          strategyType: `reply_to_${replyResult.replyType}`,
          stageNumber: (data.leadState?.currentRound || 0),
          thinkingSummary: [
            { title: '📨 回复分析', items: [`类型: ${replyResult.replyType}`, replyResult.toneSummary, `建议: ${replyResult.recommendedNextAction}`] },
            { title: '✉️ 回复策略', items: [emailResult.strategyNotes] },
          ],
          status: 'draft',
        });

        await upsertLeadState(input.leadId, ctx.user.id, {
          currentState: 'drafting_reply_email', hasReply: true,
          replyPastedAt: new Date(), lastEmailType: 'reply',
          nextAction: 'Review and send the reply email',
          followUpDueAt: null, // Cancel auto follow-up since we got a reply
        });

        const replyStatusColor = replyResult.replyType === 'interested' ? 'green' : replyResult.replyType === 'not_interested' ? 'rose' : 'amber';
        await updateLeadStatus(input.leadId, 'reply_received', replyStatusColor, replyResult.replyType);

        return {
          email: { id: emailId, subject: emailResult.subject, body: emailResult.body, type: 'reply', round: data.leadState?.currentRound || 0 },
          state: await getLeadState(input.leadId),
          thinkingCards: buildThinkingCards([
            { title: '📨 回复分析', items: [`类型: ${replyResult.replyType}`, replyResult.toneSummary, `显性需求: ${(replyResult.explicitNeeds || []).join(', ')}`, `隐藏顾虑: ${(replyResult.hiddenConcerns || []).join(', ')}`] },
            { title: '✉️ 回复策略', items: [emailResult.strategyNotes] },
          ]),
        };
      }),

    markNoReply: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await upsertLeadState(input.leadId, ctx.user.id, {
          currentState: 'waiting_response_status', hasReply: false,
          nextAction: 'Generate follow-up email',
        });
        return { state: await getLeadState(input.leadId) };
      }),
  }),

  // ============================================================
  // AUTOMATION SETTINGS
  // ============================================================
  automation: router({
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getAutomationSettings(ctx.user.id);
      return settings || {
        followUpHours: 48,
        maxFollowUpRounds: 9,
        autoFollowUpEnabled: true,
        replyCheckEnabled: true,
        notifyOnReply: true,
        notifyOnFollowUpDue: true,
        sendDelaySeconds: 5,
      };
    }),

    updateSettings: protectedProcedure
      .input(z.object({
        followUpHours: z.number().min(1).max(720).optional(),
        maxFollowUpRounds: z.number().min(1).max(20).optional(),
        autoFollowUpEnabled: z.boolean().optional(),
        replyCheckEnabled: z.boolean().optional(),
        notifyOnReply: z.boolean().optional(),
        notifyOnFollowUpDue: z.boolean().optional(),
        sendDelaySeconds: z.number().min(1).max(300).optional(),
        autoSendFollowUp: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return upsertAutomationSettings(ctx.user.id, input);
      }),
  }),

  // ============================================================
  // USER FEEDBACK
  // ============================================================
  feedback: router({
    submit: protectedProcedure
      .input(z.object({
        rating: z.number().min(1).max(5),
        content: z.string().min(1).max(2000),
        category: z.enum(['general', 'bug', 'feature', 'ux']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const fb = await createFeedback(ctx.user.id, input);
        if (!fb) throw new Error('Failed to create feedback');

        // Async AI analysis (don't block the response)
        analyzeFeedbackAsync(fb.id, fb.content, fb.rating).catch(console.error);

        return { success: true, id: fb.id };
      }),

    myList: protectedProcedure.query(async ({ ctx }) => {
      return getFeedbacksByUser(ctx.user.id);
    }),

    adminList: adminProcedure.query(async () => {
      return getAllFeedbacks();
    }),

    adminDelete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteFeedback(input.id);
        return { success: true };
      }),

    adminUpdateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['valuable', 'archived', 'analyzed']),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new Error('DB unavailable');
        const { feedbacks: fbTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await db.update(fbTable).set({ status: input.status }).where(eq(fbTable.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // ADMIN
  // ============================================================
  admin: router({
    listUsers: adminProcedure.query(async () => {
      return getAllUsers();
    }),

    // AI Prompt Management
    getAiPrompt: adminProcedure
      .input(z.object({ promptKey: z.string() }))
      .query(async ({ input }) => {
        const { db } = await import("./db");
        const { aiPromptSettings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const result = await db.select().from(aiPromptSettings).where(eq(aiPromptSettings.promptKey, input.promptKey)).limit(1);
        return result[0] || { promptKey: input.promptKey, promptText: '', updatedAt: null };
      }),

    updateAiPrompt: adminProcedure
      .input(z.object({ promptKey: z.string(), promptText: z.string() }))
      .mutation(async ({ input }) => {
        const { db } = await import("./db");
        const { aiPromptSettings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const existing = await db.select().from(aiPromptSettings).where(eq(aiPromptSettings.promptKey, input.promptKey)).limit(1);
        if (existing.length > 0) {
          await db.update(aiPromptSettings).set({ promptText: input.promptText, updatedAt: new Date() }).where(eq(aiPromptSettings.promptKey, input.promptKey));
        } else {
          await db.insert(aiPromptSettings).values({ promptKey: input.promptKey, promptText: input.promptText });
        }
        return { success: true };
      }),

    listAiPrompts: adminProcedure.query(async () => {
      const { db } = await import("./db");
      const { aiPromptSettings } = await import("../drizzle/schema");
      return await db.select().from(aiPromptSettings);
    }),
  }),
});

// ─── Async feedback analysis helper ────────────────────────────
async function analyzeFeedbackAsync(feedbackId: number, content: string, rating: number) {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `You are a product manager analyzing user feedback for an AI-powered B2B outbound email platform. 
Evaluate the feedback and return a JSON object with:
- score: integer 0-100 (how valuable this feedback is for product improvement)
- status: "valuable" (score>=60, actionable insight) or "archived" (score<60, spam/irrelevant/too vague)
- analysis: 1-2 sentence summary in Chinese explaining the value and suggested action
- category: "bug" | "feature" | "ux" | "general"

Be strict: only mark as "valuable" if it contains specific, actionable product improvement insights.`,
        },
        {
          role: 'user',
          content: `Rating: ${rating}/5\nFeedback: ${content}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'feedback_analysis',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              score: { type: 'integer' },
              status: { type: 'string', enum: ['valuable', 'archived'] },
              analysis: { type: 'string' },
              category: { type: 'string', enum: ['bug', 'feature', 'ux', 'general'] },
            },
            required: ['score', 'status', 'analysis', 'category'],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const raw = typeof rawContent === 'string' ? rawContent : null;
    if (!raw) return;
    const result = JSON.parse(raw);

    await updateFeedbackAnalysis(feedbackId, {
      status: result.status,
      aiAnalysis: result.analysis,
      aiScore: result.score,
    });

    // Notify owner if valuable
    if (result.status === 'valuable') {
      await notifyOwner({
        title: `有价值的用户反馈 (${result.score}分)`,
        content: `用户评分: ${rating}/5\n内容: ${content.substring(0, 200)}\nAI分析: ${result.analysis}`,
      });
    }
  } catch (err) {
    console.error('[Feedback] AI analysis failed:', err);
  }
}

export type AppRouter = typeof appRouter;
