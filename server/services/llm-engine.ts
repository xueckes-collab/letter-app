import { invokeLLM } from "../_core/llm";

// ============================================================
// WEBSITE ANALYSIS
// ============================================================
export async function analyzeWebsite(scrapedContent: string, senderContext: string) {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a B2B sales intelligence analyst. Analyze the scraped website content and extract structured business intelligence. Return JSON only.

Sender context for reference:
${senderContext}

Return a JSON object with these fields:
- industry (string): The company's industry
- businessModel (string): e.g. "distributor", "brand_owner", "project_contractor", "retailer", "ecommerce", "manufacturer"
- productFocus (string): Main products/services
- marketPosition (string): Market positioning and competitive stance
- websiteSignals (array of strings): Key signals from the website
- purchaseIntentScore (number 1-10): How likely they are to buy
- triggerEvents (array of strings): Events that could trigger a purchase
- companyName (string): Extracted company name
- country (string): Country/region
- rawSummary (string): Brief summary of findings`
      },
      { role: "user", content: scrapedContent }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "website_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            industry: { type: "string" },
            businessModel: { type: "string" },
            productFocus: { type: "string" },
            marketPosition: { type: "string" },
            websiteSignals: { type: "array", items: { type: "string" } },
            purchaseIntentScore: { type: "number" },
            triggerEvents: { type: "array", items: { type: "string" } },
            companyName: { type: "string" },
            country: { type: "string" },
            rawSummary: { type: "string" },
          },
          required: ["industry", "businessModel", "productFocus", "marketPosition", "websiteSignals", "purchaseIntentScore", "triggerEvents", "companyName", "country", "rawSummary"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = result.choices[0]?.message?.content;
  return JSON.parse(typeof content === 'string' ? content : '{}');
}

// ============================================================
// ICP MATCHING
// ============================================================
export async function matchICP(websiteAnalysis: Record<string, unknown>, senderContext: string) {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a B2B sales strategist. Based on the website analysis, identify the Ideal Customer Profile (ICP) match and sales strategy. Return JSON only.

Sender context:
${senderContext}

Return a JSON object with:
- icpName (string): The ICP category name (e.g. "distributor", "brand_owner", "project_contractor", "new_importer", "small_ecommerce", "chain_retailer")
- buyerRoles (array of strings): Key decision makers and their roles
- painPoints (array of strings): Their likely pain points
- triggers (array of strings): Events that could trigger buying
- decisionStyle (string): How they make purchasing decisions
- salesAngles (array of objects with "angle" and "reasoning" fields): Best sales approaches`
      },
      { role: "user", content: JSON.stringify(websiteAnalysis) }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "icp_match",
        strict: true,
        schema: {
          type: "object",
          properties: {
            icpName: { type: "string" },
            buyerRoles: { type: "array", items: { type: "string" } },
            painPoints: { type: "array", items: { type: "string" } },
            triggers: { type: "array", items: { type: "string" } },
            decisionStyle: { type: "string" },
            salesAngles: { type: "array", items: { type: "object", properties: { angle: { type: "string" }, reasoning: { type: "string" } }, required: ["angle", "reasoning"], additionalProperties: false } },
          },
          required: ["icpName", "buyerRoles", "painPoints", "triggers", "decisionStyle", "salesAngles"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = result.choices[0]?.message?.content;
  return JSON.parse(typeof content === 'string' ? content : '{}');
}

// ============================================================
// USP MATCHING
// ============================================================
export async function matchUSP(websiteAnalysis: Record<string, unknown>, icpMatch: Record<string, unknown>, senderContext: string) {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a B2B value proposition specialist. Based on the website analysis and ICP match, select the best USPs and create personalized value propositions. Return JSON only.

Sender context:
${senderContext}

Return a JSON object with:
- primaryUsp (string): The primary unique selling proposition
- secondaryUsp (string): The secondary USP
- whyFit (string): Why these USPs fit this specific prospect
- proofPoints (array of strings): Evidence to back up claims
- emailAngle (object with "hook", "valueStatement", "cta" fields): The email angle to use`
      },
      { role: "user", content: JSON.stringify({ websiteAnalysis, icpMatch }) }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "usp_match",
        strict: true,
        schema: {
          type: "object",
          properties: {
            primaryUsp: { type: "string" },
            secondaryUsp: { type: "string" },
            whyFit: { type: "string" },
            proofPoints: { type: "array", items: { type: "string" } },
            emailAngle: { type: "object", properties: { hook: { type: "string" }, valueStatement: { type: "string" }, cta: { type: "string" } }, required: ["hook", "valueStatement", "cta"], additionalProperties: false },
          },
          required: ["primaryUsp", "secondaryUsp", "whyFit", "proofPoints", "emailAngle"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = result.choices[0]?.message?.content;
  return JSON.parse(typeof content === 'string' ? content : '{}');
}

// ============================================================
// EMAIL GENERATION
// ============================================================
export async function generateEmail(params: {
  type: 'warm' | 'followup' | 'reply';
  websiteAnalysis: Record<string, unknown>;
  icpMatch: Record<string, unknown>;
  uspMatch: Record<string, unknown>;
  senderContext: string;
  contactName?: string;
  round?: number;
  previousEmails?: Array<{ subject: string; body: string; type: string }>;
  replyContent?: string;
  replyAnalysis?: Record<string, unknown>;
  followupStrategy?: Record<string, unknown>;
}) {
  const { type, websiteAnalysis, icpMatch, uspMatch, senderContext, contactName, round, previousEmails, replyContent, replyAnalysis, followupStrategy } = params;

  let systemPrompt = `You are an expert B2B cold email copywriter. Write a highly personalized sales email. Return JSON only.

Sender context:
${senderContext}

Rules:
- Write in English
- Keep subject line under 60 characters
- Keep body under 200 words
- Be specific and reference the prospect's business
- No generic phrases like "I hope this email finds you well"
- Include a clear, low-friction CTA
- Sound human, not like a template`;

  if (type === 'followup' && followupStrategy) {
    systemPrompt += `\n\nFollow-up Strategy for Round ${round}:\n${JSON.stringify(followupStrategy)}`;
  }

  if (type === 'reply' && replyAnalysis) {
    systemPrompt += `\n\nReply Analysis:\n${JSON.stringify(replyAnalysis)}\n\nOriginal Reply from Prospect:\n${replyContent}`;
  }

  systemPrompt += `\n\nReturn a JSON object with:
- subject (string): Email subject line
- body (string): Email body text
- strategyNotes (string): Brief notes on the strategy used`;

  const userContent: Record<string, unknown> = {
    emailType: type,
    contactName: contactName || 'there',
    websiteAnalysis,
    icpMatch,
    uspMatch,
    round: round || 0,
  };

  if (previousEmails?.length) {
    userContent.previousEmails = previousEmails;
  }

  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userContent) }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "email_generation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
            strategyNotes: { type: "string" },
          },
          required: ["subject", "body", "strategyNotes"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = result.choices[0]?.message?.content;
  return JSON.parse(typeof content === 'string' ? content : '{}');
}

// ============================================================
// REPLY ANALYSIS
// ============================================================
export async function analyzeReply(replyContent: string, context: { websiteAnalysis: Record<string, unknown>; icpMatch: Record<string, unknown>; previousEmails: Array<{ subject: string; body: string; type: string }> }) {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a B2B sales communication analyst. Analyze the prospect's reply to understand their intent and recommend next steps. Return JSON only.

Context of previous emails and prospect info:
${JSON.stringify(context)}

Return a JSON object with:
- replyType (string): One of "interested", "objection", "question", "not_interested", "out_of_office", "referral", "unclear"
- explicitNeeds (array of strings): What they explicitly asked for or mentioned
- hiddenConcerns (array of strings): Underlying concerns or objections
- recommendedNextAction (string): What to do next
- toneSummary (string): Brief summary of their tone and intent`
      },
      { role: "user", content: replyContent }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "reply_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            replyType: { type: "string" },
            explicitNeeds: { type: "array", items: { type: "string" } },
            hiddenConcerns: { type: "array", items: { type: "string" } },
            recommendedNextAction: { type: "string" },
            toneSummary: { type: "string" },
          },
          required: ["replyType", "explicitNeeds", "hiddenConcerns", "recommendedNextAction", "toneSummary"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = result.choices[0]?.message?.content;
  return JSON.parse(typeof content === 'string' ? content : '{}');
}
