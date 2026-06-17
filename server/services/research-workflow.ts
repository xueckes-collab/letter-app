import type { WebsiteResearchSource } from "./scrapling-crawler";
import { evaluateEmailQuality, type EmailQualityResult } from "./email-quality";
import { invokeResponsesJSON } from "./openai-responses";

export type BuyerType =
  | "distributor"
  | "brand_owner"
  | "project_contractor"
  | "retailer"
  | "ecommerce"
  | "manufacturer"
  | "peer_or_competitor"
  | "low_fit"
  | "unknown";

export interface CompanyResearch {
  companyName: string;
  country: string;
  buyerType: BuyerType;
  fitVerdict: "high" | "medium" | "low" | "peer_cautious" | "unknown";
  shouldWriteEmail: boolean;
  oneLineProfile: string;
  productLines: string[];
  marketSignals: string[];
  concreteDetails: string[];
  sourceUrls: string[];
  risks: string[];
  noEvidenceClaims: string[];
}

export interface HandoffBrief {
  customerProfile: string;
  buyerType: BuyerType;
  fitVerdict: CompanyResearch["fitVerdict"];
  bestOutreachAngle: string;
  customerDetailsToMention: string[];
  doNotSay: string[];
  suggestedCTA: string;
  sourceUrls: string[];
  isPeerOrCompetitor: boolean;
}

export interface ColdEmailDraft {
  subject: string;
  body: string;
  replyProbability: number;
  reason: string;
}

export interface ColdEmailWorkflowResult {
  research: CompanyResearch;
  handoffBrief: HandoffBrief;
  draft: ColdEmailDraft;
  quality: EmailQualityResult;
}

const COMPANY_RESEARCH_SCHEMA = {
  type: "object",
  properties: {
    companyName: { type: "string" },
    country: { type: "string" },
    buyerType: { type: "string", enum: ["distributor", "brand_owner", "project_contractor", "retailer", "ecommerce", "manufacturer", "peer_or_competitor", "low_fit", "unknown"] },
    fitVerdict: { type: "string", enum: ["high", "medium", "low", "peer_cautious", "unknown"] },
    shouldWriteEmail: { type: "boolean" },
    oneLineProfile: { type: "string" },
    productLines: { type: "array", items: { type: "string" } },
    marketSignals: { type: "array", items: { type: "string" } },
    concreteDetails: { type: "array", items: { type: "string" } },
    sourceUrls: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    noEvidenceClaims: { type: "array", items: { type: "string" } },
  },
  required: ["companyName", "country", "buyerType", "fitVerdict", "shouldWriteEmail", "oneLineProfile", "productLines", "marketSignals", "concreteDetails", "sourceUrls", "risks", "noEvidenceClaims"],
  additionalProperties: false,
};

const HANDOFF_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    customerProfile: { type: "string" },
    buyerType: { type: "string", enum: ["distributor", "brand_owner", "project_contractor", "retailer", "ecommerce", "manufacturer", "peer_or_competitor", "low_fit", "unknown"] },
    fitVerdict: { type: "string", enum: ["high", "medium", "low", "peer_cautious", "unknown"] },
    bestOutreachAngle: { type: "string" },
    customerDetailsToMention: { type: "array", items: { type: "string" } },
    doNotSay: { type: "array", items: { type: "string" } },
    suggestedCTA: { type: "string" },
    sourceUrls: { type: "array", items: { type: "string" } },
    isPeerOrCompetitor: { type: "boolean" },
  },
  required: ["customerProfile", "buyerType", "fitVerdict", "bestOutreachAngle", "customerDetailsToMention", "doNotSay", "suggestedCTA", "sourceUrls", "isPeerOrCompetitor"],
  additionalProperties: false,
};

const COLD_EMAIL_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    replyProbability: { type: "number" },
    reason: { type: "string" },
  },
  required: ["subject", "body", "replyProbability", "reason"],
  additionalProperties: false,
};

function compactSources(sources: WebsiteResearchSource[]) {
  return sources
    .filter((source) => !source.error && source.text?.trim())
    .slice(0, 12)
    .map((source) => ({
      url: source.url,
      pageType: source.pageType,
      title: source.title,
      text: source.text.slice(0, 6000),
      confidence: source.confidence,
      extractionMethod: source.extractionMethod,
    }));
}

export function formatHandoffBrief(brief: HandoffBrief) {
  return [
    `Customer profile: ${brief.customerProfile}`,
    `Buyer type: ${brief.buyerType}`,
    `Fit verdict: ${brief.fitVerdict}`,
    `Best outreach angle: ${brief.bestOutreachAngle}`,
    `Details to mention: ${brief.customerDetailsToMention.join("; ") || "not found"}`,
    `Do not say: ${brief.doNotSay.join("; ") || "do not invent customer demand"}`,
    `Suggested CTA: ${brief.suggestedCTA}`,
    `Source URLs: ${brief.sourceUrls.join("; ") || "not found"}`,
  ].join("\n");
}

export async function buildCompanyResearch(
  sources: WebsiteResearchSource[],
  senderContext: string,
): Promise<CompanyResearch> {
  return invokeResponsesJSON<CompanyResearch>({
    schemaName: "company_research",
    schema: COMPANY_RESEARCH_SCHEMA,
    maxOutputTokens: 2400,
    input: [
      {
        role: "system",
        content: [
          "You are a B2B customer research analyst for export sales.",
          "Use only the provided website evidence. If evidence is missing, say not found.",
          "Classify whether this company is a real buyer, a distributor, a project/customer channel, a peer manufacturer, or low fit.",
          "Never claim the company is actively sourcing unless the sources prove it.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          senderContext,
          websiteSources: compactSources(sources),
        }),
      },
    ],
  });
}

export async function buildOutreachBrief(research: CompanyResearch, senderContext: string): Promise<HandoffBrief> {
  return invokeResponsesJSON<HandoffBrief>({
    schemaName: "handoff_brief",
    schema: HANDOFF_BRIEF_SCHEMA,
    maxOutputTokens: 1800,
    input: [
      {
        role: "system",
        content: [
          "Build a handoff brief for a cold email writer.",
          "The brief must be usable without doing new research.",
          "If the target is a peer or competitor, use a cautious cooperation angle such as benchmark specs, backup production, special SKU, or sample comparison.",
          "Include specific details the email can mention and a list of claims the email must avoid.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ senderContext, research }),
      },
    ],
  });
}

export async function writeColdEmailFromBrief(
  brief: HandoffBrief,
  senderContext: string,
  rewriteNotes: string[] = [],
): Promise<ColdEmailDraft> {
  return invokeResponsesJSON<ColdEmailDraft>({
    schemaName: "cold_email",
    schema: COLD_EMAIL_SCHEMA,
    maxOutputTokens: 1200,
    input: [
      {
        role: "system",
        content: [
          "You write short, human B2B cold emails in English.",
          "Use the handoff brief only. Do not invent new facts.",
          "Write 50-120 words, with short visual paragraphs.",
          "CTA must be a low-friction question on its own final line.",
          "Avoid AI sales language. Do not use labels or markdown.",
          "If this is peer/competitor outreach, acknowledge it is not a standard supplier pitch.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          senderContext,
          handoffBrief: brief,
          rewriteNotes,
        }),
      },
    ],
  });
}

export async function runColdEmailWorkflow(
  sources: WebsiteResearchSource[],
  senderContext: string,
): Promise<ColdEmailWorkflowResult> {
  const research = await buildCompanyResearch(sources, senderContext);
  const handoffBrief = await buildOutreachBrief(research, senderContext);

  let draft = await writeColdEmailFromBrief(handoffBrief, senderContext);
  let quality = evaluateEmailQuality({
    subject: draft.subject,
    body: draft.body,
    customerDetails: handoffBrief.customerDetailsToMention,
    peerCaution: {
      prohibitedPeerNames: [],
      isPeerOrCompetitor: handoffBrief.isPeerOrCompetitor,
    },
  });

  for (let attempt = 0; attempt < 2 && quality.shouldRewrite; attempt += 1) {
    draft = await writeColdEmailFromBrief(handoffBrief, senderContext, quality.warnings);
    quality = evaluateEmailQuality({
      subject: draft.subject,
      body: draft.body,
      customerDetails: handoffBrief.customerDetailsToMention,
      peerCaution: {
        prohibitedPeerNames: [],
        isPeerOrCompetitor: handoffBrief.isPeerOrCompetitor,
      },
    });
  }

  return { research, handoffBrief, draft, quality };
}
