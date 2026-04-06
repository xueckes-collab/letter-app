import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getSenderProfile, upsertSenderProfile, createSenderAsset,
  createLead, getLeadsByUser, getLeadById, getLeadWithRelations,
  saveWebsiteAnalysis, saveIcpMatch, saveUspMatch,
  createEmailSequence, updateEmailSequence, getEmailsByLead,
  createReplyAnalysis, getLeadState, upsertLeadState,
  updateLeadStatus, updateLeadCompanyInfo,
} from "./db";
import { scrapeWebsite, formatScrapingResults } from "./services/scraper";
import { analyzeWebsite, matchICP, matchUSP, generateEmail, analyzeReply } from "./services/llm-engine";
import { getStrategyForRound } from "./services/follow-up-strategies";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

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

// Helper: build thinking cards from analysis steps
function buildThinkingCards(steps: Array<{ title: string; items: string[] }>) {
  return steps.map((step, i) => ({ id: `step-${i}`, title: step.title, items: step.items }));
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

        // Extract text from uploaded file using LLM vision
        let extractedText: string | null = null;
        try {
          const { invokeLLM } = await import("./_core/llm");
          const mimeType = input.mimeType || 'application/octet-stream';
          const isImage = mimeType.startsWith('image/');
          const isPdf = mimeType === 'application/pdf';
          if (isImage || isPdf) {
            const result = await invokeLLM({
              messages: [
                { role: "system", content: "Extract all text content from this document. Return the raw text only, no formatting or commentary." },
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
          userId: ctx.user.id,
          senderProfileId: profile.id,
          fileName: input.fileName,
          mimeType: input.mimeType || null,
          fileSize: input.fileSize || null,
          fileUrl: url,
          fileKey,
          extractedText,
        });
        return { success: true, assetId, url };
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
        // 1. Create lead
        const leadId = await createLead({
          userId: ctx.user.id,
          email: input.email,
          website: input.website,
          contactName: input.contactName || null,
          source: 'manual',
          status: 'new',
          replyStatus: 'not_checked',
          statusColor: 'slate',
        });

        // 2. Scrape website
        const scrapeResult = await scrapeWebsite(input.website);
        const scrapedText = formatScrapingResults(scrapeResult);
        const senderContext = await buildSenderContext(ctx.user.id);

        // 3. Analyze website
        const waResult = await analyzeWebsite(scrapedText, senderContext);
        await saveWebsiteAnalysis({
          userId: ctx.user.id,
          leadId,
          industry: waResult.industry,
          businessModel: waResult.businessModel,
          productFocus: waResult.productFocus,
          marketPosition: waResult.marketPosition,
          websiteSignals: waResult.websiteSignals,
          purchaseIntentScore: waResult.purchaseIntentScore,
          triggerEvents: waResult.triggerEvents,
          rawSummary: waResult.rawSummary,
        });

        // Update lead with extracted info
        if (waResult.companyName || waResult.country) {
          await updateLeadCompanyInfo(leadId, waResult.companyName || '', waResult.country || '');
        }

        // 4. ICP match
        const icpResult = await matchICP(waResult, senderContext);
        await saveIcpMatch({
          userId: ctx.user.id,
          leadId,
          icpName: icpResult.icpName,
          buyerRoles: icpResult.buyerRoles,
          painPoints: icpResult.painPoints,
          triggers: icpResult.triggers,
          decisionStyle: icpResult.decisionStyle,
          salesAngles: icpResult.salesAngles,
        });

        // 5. USP match
        const uspResult = await matchUSP(waResult, icpResult, senderContext);
        await saveUspMatch({
          userId: ctx.user.id,
          leadId,
          primaryUsp: uspResult.primaryUsp,
          secondaryUsp: uspResult.secondaryUsp,
          whyFit: uspResult.whyFit,
          proofPoints: uspResult.proofPoints,
          emailAngle: uspResult.emailAngle,
        });

        // 6. Generate warm email
        const emailResult = await generateEmail({
          type: 'warm',
          websiteAnalysis: waResult,
          icpMatch: icpResult,
          uspMatch: uspResult,
          senderContext,
          contactName: input.contactName,
        });

        const emailId = await createEmailSequence({
          userId: ctx.user.id,
          leadId,
          emailType: 'warm',
          subject: emailResult.subject,
          body: emailResult.body,
          strategyType: 'initial_warm',
          stageNumber: 0,
          thinkingSummary: [
            { title: 'Website Analysis', items: [waResult.rawSummary, `Industry: ${waResult.industry}`, `Intent Score: ${waResult.purchaseIntentScore}/10`] },
            { title: 'ICP Match', items: [`Type: ${icpResult.icpName}`, `Pain Points: ${(icpResult.painPoints || []).join(', ')}`] },
            { title: 'USP Selection', items: [`Primary: ${uspResult.primaryUsp}`, `Why: ${uspResult.whyFit}`] },
          ],
          status: 'draft',
        });

        // 7. Set lead state
        await upsertLeadState(leadId, ctx.user.id, {
          currentState: 'waiting_user_send',
          currentRound: 0,
          lastEmailType: 'warm',
          nextAction: 'Send the warm email to the prospect',
        });
        await updateLeadStatus(leadId, 'email_drafted', 'blue', 'not_checked');

        const state = await getLeadState(leadId);
        const lead = await getLeadById(leadId, ctx.user.id);

        return {
          lead,
          state,
          email: { id: emailId, subject: emailResult.subject, body: emailResult.body, type: 'warm', round: 0 },
          thinkingCards: buildThinkingCards([
            { title: '🌐 网站分析', items: [waResult.rawSummary, `行业: ${waResult.industry}`, `购买意向: ${waResult.purchaseIntentScore}/10`] },
            { title: '🎯 ICP 匹配', items: [`类型: ${icpResult.icpName}`, `痛点: ${(icpResult.painPoints || []).join(', ')}`] },
            { title: '💎 USP 选择', items: [`主打: ${uspResult.primaryUsp}`, `原因: ${uspResult.whyFit}`] },
            { title: '✉️ 邮件策略', items: [emailResult.strategyNotes] },
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

        for (const line of lines) {
          try {
            const parts = line.split(/[,\t]/).map(s => s.trim());
            const email = parts.find(p => p.includes('@')) || '';
            const website = parts.find(p => p.includes('.') && !p.includes('@')) || '';
            const contactName = parts.find(p => !p.includes('@') && !p.includes('.')) || '';
            if (!email || !website) { failedCount++; continue; }
            await createLead({
              userId: ctx.user.id,
              email, website, contactName: contactName || null,
              importBatchId: batchId, source: 'bulk',
              status: 'new', replyStatus: 'not_checked', statusColor: 'slate',
            });
            successCount++;
          } catch { failedCount++; }
        }
        return { successCount, failedCount, batchId };
      }),
  }),

  // ============================================================
  // WORKFLOW
  // ============================================================
  workflow: router({
    loadLead: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ ctx, input }) => {
        const data = await getLeadWithRelations(input.leadId, ctx.user.id);
        if (!data) throw new Error("Lead not found");

        // Build timeline
        const timeline: Array<Record<string, unknown>> = [];
        for (const email of data.emailSequences) {
          const thinking = email.thinkingSummary as Array<{ title: string; items: string[] }> | null;
          if (thinking) {
            timeline.push({ id: `thinking-${email.id}`, kind: 'thinking', title: `${email.emailType} 思考流程`, cards: thinking });
          }
          timeline.push({
            id: String(email.id),
            kind: 'email',
            email: {
              id: email.id, subject: email.subject, body: email.body,
              type: email.emailType, round: email.stageNumber,
              status: email.status,
            },
          });
        }

        return { lead: data.lead, state: data.leadState, timeline };
      }),

    markSent: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await upsertLeadState(input.leadId, ctx.user.id, {
          currentState: 'waiting_response_status',
          nextAction: 'Wait for prospect response or mark no reply for follow-up',
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
        const waData = data.websiteAnalysis || {};
        const icpData = data.icpMatch || {};
        const uspData = data.uspMatch || {};

        const emailResult = await generateEmail({
          type: 'warm',
          websiteAnalysis: waData as Record<string, unknown>,
          icpMatch: icpData as Record<string, unknown>,
          uspMatch: uspData as Record<string, unknown>,
          senderContext,
          contactName: data.lead.contactName || undefined,
        });

        await updateEmailSequence(input.emailId, {
          subject: emailResult.subject,
          body: emailResult.body,
        });

        return {
          email: { id: input.emailId, subject: emailResult.subject, body: emailResult.body, type: 'warm', round: 0 },
          thinkingCards: buildThinkingCards([
            { title: '🔄 重新生成', items: [emailResult.strategyNotes] },
          ]),
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
          senderContext,
          contactName: data.lead.contactName || undefined,
          round: nextRound,
          previousEmails,
          followupStrategy: strategy ? (strategy as unknown as Record<string, unknown>) : undefined,
        });

        const emailId = await createEmailSequence({
          userId: ctx.user.id,
          leadId: input.leadId,
          emailType: 'followup',
          subject: emailResult.subject,
          body: emailResult.body,
          strategyType: strategy?.name || `Round ${nextRound}`,
          stageNumber: nextRound,
          thinkingSummary: [
            { title: `Round ${nextRound}: ${strategy?.nameZh || 'Follow-up'}`, items: [strategy?.description || '', emailResult.strategyNotes] },
          ],
          status: 'draft',
        });

        await upsertLeadState(input.leadId, ctx.user.id, {
          currentState: 'waiting_user_send_followup',
          currentRound: nextRound,
          lastEmailType: 'followup',
          nextAction: `Send round ${nextRound} follow-up email`,
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

        // 1. Analyze the reply
        const replyResult = await analyzeReply(input.replyContent, {
          websiteAnalysis: (data.websiteAnalysis || {}) as Record<string, unknown>,
          icpMatch: (data.icpMatch || {}) as Record<string, unknown>,
          previousEmails,
        });

        await createReplyAnalysis({
          userId: ctx.user.id,
          leadId: input.leadId,
          originalReply: input.replyContent,
          replyType: replyResult.replyType,
          explicitNeeds: replyResult.explicitNeeds,
          hiddenConcerns: replyResult.hiddenConcerns,
          recommendedNextAction: replyResult.recommendedNextAction,
          thinkingSummary: [
            { title: '回复分析', items: [`类型: ${replyResult.replyType}`, `建议: ${replyResult.recommendedNextAction}`] },
          ],
        });

        // 2. Generate reply email
        const emailResult = await generateEmail({
          type: 'reply',
          websiteAnalysis: (data.websiteAnalysis || {}) as Record<string, unknown>,
          icpMatch: (data.icpMatch || {}) as Record<string, unknown>,
          uspMatch: (data.uspMatch || {}) as Record<string, unknown>,
          senderContext,
          contactName: data.lead.contactName || undefined,
          previousEmails,
          replyContent: input.replyContent,
          replyAnalysis: replyResult,
        });

        const emailId = await createEmailSequence({
          userId: ctx.user.id,
          leadId: input.leadId,
          emailType: 'reply',
          subject: emailResult.subject,
          body: emailResult.body,
          strategyType: `reply_to_${replyResult.replyType}`,
          stageNumber: (data.leadState?.currentRound || 0),
          thinkingSummary: [
            { title: '📨 回复分析', items: [`类型: ${replyResult.replyType}`, replyResult.toneSummary, `建议: ${replyResult.recommendedNextAction}`] },
            { title: '✉️ 回复策略', items: [emailResult.strategyNotes] },
          ],
          status: 'draft',
        });

        await upsertLeadState(input.leadId, ctx.user.id, {
          currentState: 'drafting_reply_email',
          hasReply: true,
          replyPastedAt: new Date(),
          lastEmailType: 'reply',
          nextAction: 'Review and send the reply email',
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
          currentState: 'waiting_response_status',
          hasReply: false,
          nextAction: 'Generate follow-up email',
        });
        return { state: await getLeadState(input.leadId) };
      }),
  }),

  // ============================================================
  // ADMIN
  // ============================================================
  admin: router({
    listUsers: adminProcedure.query(async () => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      const { users } = await import("../drizzle/schema");
      return db.select().from(users).orderBy(users.createdAt);
    }),
  }),
});

export type AppRouter = typeof appRouter;
