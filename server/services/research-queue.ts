import { Queue, type JobsOptions } from "bullmq";

export const RESEARCH_EMAIL_QUEUE_NAME = "research-email";
export const RESEARCH_EMAIL_JOB_NAME = "research-email";

export interface ResearchEmailJobData {
  userId: number;
  leadId: number;
  forceRegenerate?: boolean;
}

let researchQueue: Queue<ResearchEmailJobData> | null = null;

export function createResearchRedisConnection() {
  if (process.env.REDIS_URL) {
    return {
      url: process.env.REDIS_URL,
      maxRetriesPerRequest: null,
    };
  }

  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number.parseInt(process.env.REDIS_PORT || "6379", 10),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || "0", 10),
    maxRetriesPerRequest: null,
  };
}

export function getResearchQueue() {
  if (!researchQueue) {
    researchQueue = new Queue<ResearchEmailJobData>(RESEARCH_EMAIL_QUEUE_NAME, {
      connection: createResearchRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5_000,
        },
        removeOnComplete: {
          count: 1_000,
        },
        removeOnFail: {
          count: 5_000,
        },
      },
    });
  }

  return researchQueue;
}

export async function enqueueResearchEmailJob(
  jobData: ResearchEmailJobData,
  options: JobsOptions = {},
) {
  return getResearchQueue().add(RESEARCH_EMAIL_JOB_NAME, jobData, {
    jobId: `research-email:${jobData.userId}:${jobData.leadId}:${jobData.forceRegenerate ? "force" : "default"}`,
    ...options,
  });
}
