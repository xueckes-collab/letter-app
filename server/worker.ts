import "dotenv/config";
import { Worker, type Job } from "bullmq";
import {
  createResearchRedisConnection,
  RESEARCH_EMAIL_JOB_NAME,
  RESEARCH_EMAIL_QUEUE_NAME,
  type ResearchEmailJobData,
} from "./services/research-queue";
import { crawlWebsiteDeep } from "./services/scrapling-crawler";
import { formatHandoffBrief, runColdEmailWorkflow } from "./services/research-workflow";
import {
  createEmailSequence,
  getEmailsByLead,
  getLeadById,
  getSenderProfile,
  getUserById,
  saveLeadResearchArtifacts,
  updateLeadCompanyInfo,
  updateLeadResearchStatus,
  updateLeadStatus,
  upsertLeadState,
} from "./db";

const DEFAULT_CONCURRENCY = 2;

export async function processResearchEmailJob(jobData: ResearchEmailJobData) {
  const lead = await getLeadById(jobData.leadId, jobData.userId);
  if (!lead) {
    throw new Error(`Lead ${jobData.leadId} not found for user ${jobData.userId}`);
  }

  const existingEmails = await getEmailsByLead(jobData.leadId);
  if (existingEmails.length > 0 && !jobData.forceRegenerate) {
    return {
      status: "skipped",
      reason: "email-already-exists",
      userId: jobData.userId,
      leadId: jobData.leadId,
    };
  }

  try {
    await updateLeadResearchStatus(jobData.leadId, jobData.userId, "crawling", null);
    const sources = await crawlWebsiteDeep(lead.website, {
      maxPages: 12,
      timeoutMs: 60_000,
      networkIdle: true,
      disableResources: true,
      solveCloudflare: true,
    });

    const successfulSources = sources.filter((source) => !source.error && source.text?.trim());
    if (successfulSources.length === 0) {
      const message = sources[0]?.error?.message || "No usable website content was extracted.";
      await saveLeadResearchArtifacts(jobData.leadId, jobData.userId, {
        researchStatus: "failed",
        researchError: message,
        researchSources: sources,
        creditsConsumed: 0,
      });
      throw new Error(message);
    }

    await saveLeadResearchArtifacts(jobData.leadId, jobData.userId, {
      researchStatus: "researching",
      researchSources: sources,
      researchError: null,
      creditsConsumed: 1,
    });

    const senderContext = await buildSenderContext(jobData.userId);
    const result = await runColdEmailWorkflow(sources, senderContext);
    const handoffBrief = formatHandoffBrief(result.handoffBrief);

    if (result.research.companyName || result.research.country) {
      await updateLeadCompanyInfo(jobData.leadId, result.research.companyName || "", result.research.country || "");
    }

    await saveLeadResearchArtifacts(jobData.leadId, jobData.userId, {
      researchStatus: "writing",
      handoffBrief,
      replyProbability: Math.round(result.draft.replyProbability),
      qualityScore: result.quality.qualityScore,
      warningNotes: result.quality.warnings,
      creditsConsumed: result.research.shouldWriteEmail ? 2 : 1,
    });

    const emailId = await createEmailSequence({
      userId: jobData.userId,
      leadId: jobData.leadId,
      emailType: "warm",
      subject: result.draft.subject,
      body: result.draft.body,
      strategyType: "scrapling_research_brief",
      stageNumber: 0,
      thinkingSummary: [
        {
          title: "Deep Research",
          items: [
            result.research.oneLineProfile,
            `Buyer type: ${result.research.buyerType}`,
            `Fit: ${result.research.fitVerdict}`,
          ],
        },
        {
          title: "Handoff Brief",
          items: [
            result.handoffBrief.bestOutreachAngle,
            `CTA: ${result.handoffBrief.suggestedCTA}`,
          ],
        },
        {
          title: "Quality Gate",
          items: [
            `Score: ${result.quality.qualityScore}/100`,
            `Reply probability: ${Math.round(result.draft.replyProbability)}%`,
            result.quality.passed ? "Passed" : result.quality.warnings.join("; "),
          ],
        },
      ],
      status: "draft",
    });

    await saveLeadResearchArtifacts(jobData.leadId, jobData.userId, {
      researchStatus: result.quality.passed ? "ready" : "needs_review",
      replyProbability: Math.round(result.draft.replyProbability),
      qualityScore: result.quality.qualityScore,
      warningNotes: result.quality.warnings,
      creditsConsumed: result.research.shouldWriteEmail ? 2 : 1,
    });

    await upsertLeadState(jobData.leadId, jobData.userId, {
      currentState: "waiting_user_send",
      currentRound: 0,
      lastEmailType: "warm",
      nextAction: result.quality.passed ? "审核并发送开发信" : "人工审核开发信质量后再发送",
    });
    await updateLeadStatus(jobData.leadId, "email_drafted", result.quality.passed ? "blue" : "amber", "not_checked");

    return {
      status: "ready",
      userId: jobData.userId,
      leadId: jobData.leadId,
      emailId,
      qualityScore: result.quality.qualityScore,
      replyProbability: Math.round(result.draft.replyProbability),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateLeadResearchStatus(jobData.leadId, jobData.userId, "failed", message);
    throw error;
  }
}

async function buildSenderContext(userId: number) {
  const [profile, user] = await Promise.all([getSenderProfile(userId), getUserById(userId)]);
  if (!profile) return "No sender profile configured yet.";

  const lines = [
    `Sender Name: ${user?.name || ""}`,
    `Company: ${profile.companyName}`,
    `Website: ${profile.website || ""}`,
    `Products: ${profile.mainProducts || ""}`,
    `Advantages: ${profile.coreAdvantages || ""}`,
    `Certifications: ${profile.certifications || ""}`,
    `MOQ/Lead Time: ${profile.moqLeadTime || ""}`,
    `Sample Policy: ${profile.samplePolicy || ""}`,
    `Customization: ${profile.customization || ""}`,
  ];

  if (profile.assets?.length) {
    lines.push("");
    lines.push("Uploaded Asset Summaries:");
    for (const asset of profile.assets) {
      if (asset.extractedText) lines.push(`- ${asset.fileName}: ${asset.extractedText.substring(0, 500)}`);
    }
  }

  return lines.join("\n");
}

export function createResearchWorker() {
  const concurrency = Number.parseInt(
    process.env.RESEARCH_WORKER_CONCURRENCY || `${DEFAULT_CONCURRENCY}`,
    10,
  );

  const worker = new Worker<ResearchEmailJobData>(
    RESEARCH_EMAIL_QUEUE_NAME,
    async (job: Job<ResearchEmailJobData>) => {
      if (job.name !== RESEARCH_EMAIL_JOB_NAME) {
        throw new Error(`Unsupported research queue job: ${job.name}`);
      }

      return processResearchEmailJob(job.data);
    },
    {
      connection: createResearchRedisConnection(),
      concurrency,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[ResearchWorker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[ResearchWorker] Job ${job?.id || "unknown"} failed:`, error);
  });

  worker.on("error", (error) => {
    console.error("[ResearchWorker] Worker error:", error);
  });

  return worker;
}

const worker = createResearchWorker();

async function shutdown(signal: NodeJS.Signals) {
  console.log(`[ResearchWorker] ${signal} received, shutting down`);
  await worker.close();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
