/**
 * LLM Engine - GPT-4o powered sales intelligence.
 * All analysis and generation functions use chain-of-thought reasoning
 * with structured JSON output for reliable, intelligent results.
 */
import { invokeGPT, gptJSON } from "./gpt";

// ============================================================
// RESULT TYPE INTERFACES
// ============================================================
export interface WebsiteAnalysisResult {
  industry: string;
  businessModel: string;
  productFocus: string;
  marketPosition: string;
  websiteSignals: string[];
  purchaseIntentScore: number;
  triggerEvents: string[];
  companyName: string;
  country: string;
  rawSummary: string;
}

export interface ICPMatchResult {
  icpName: string;
  buyerRoles: string[];
  painPoints: string[];
  triggers: string[];
  decisionStyle: string;
  salesAngles: Array<{ angle: string; reasoning: string }>;
}

export interface USPMatchResult {
  primaryUsp: string;
  secondaryUsp: string;
  whyFit: string;
  proofPoints: string[];
  emailAngle: { hook: string; valueStatement: string; cta: string };
}

export interface EmailResult {
  subject: string;
  body: string;
  strategyNotes: string;
}

export interface ReplyAnalysisResult {
  replyType: string;
  explicitNeeds: string[];
  hiddenConcerns: string[];
  recommendedNextAction: string;
  toneSummary: string;
}

// ============================================================
// WEBSITE ANALYSIS
// ============================================================
export async function analyzeWebsite(scrapedContent: string, senderContext: string): Promise<WebsiteAnalysisResult> {
  return gptJSON<WebsiteAnalysisResult>(
    `You are a senior B2B sales intelligence analyst with 15 years of experience in international trade.

Your task: Analyze the scraped website content to build a comprehensive prospect profile. Think step by step:

1. IDENTIFY the company — name, country, industry vertical
2. CLASSIFY their business model — are they a distributor, brand owner, retailer, project contractor, manufacturer, or e-commerce player?
3. ASSESS their product focus — what do they sell, what categories matter most?
4. EVALUATE market position — are they premium, mid-range, or budget? Growing or established?
5. DETECT purchase signals — new product launches, expansion plans, certifications sought, RFQ pages, contact forms
6. SCORE purchase intent (1-10) — based on concrete signals, not guesswork
7. IDENTIFY trigger events — things that could prompt them to seek new suppliers

Sender context (the company reaching out):
${senderContext}

Be specific and evidence-based. Every claim should reference something from the website content. If information is missing, say so rather than guessing.`,

    `Analyze this website content:\n\n${scrapedContent}`,

    {
      name: "website_analysis",
      strict: true,
      schema: {
        type: "object",
        properties: {
          industry: { type: "string", description: "Specific industry vertical, e.g. 'flooring distribution' not just 'construction'" },
          businessModel: { type: "string", description: "One of: distributor, brand_owner, project_contractor, retailer, ecommerce, manufacturer, wholesaler" },
          productFocus: { type: "string", description: "Their main product categories and what they emphasize" },
          marketPosition: { type: "string", description: "Premium/mid-range/budget, market share, competitive stance" },
          websiteSignals: { type: "array", items: { type: "string" }, description: "Specific signals found on the website that indicate buying potential" },
          purchaseIntentScore: { type: "number", description: "1-10 score based on concrete evidence" },
          triggerEvents: { type: "array", items: { type: "string" }, description: "Events that could trigger a purchase decision" },
          companyName: { type: "string" },
          country: { type: "string" },
          rawSummary: { type: "string", description: "2-3 sentence executive summary of key findings" },
        },
        required: ["industry", "businessModel", "productFocus", "marketPosition", "websiteSignals", "purchaseIntentScore", "triggerEvents", "companyName", "country", "rawSummary"],
        additionalProperties: false,
      },
    },
    { temperature: 0.3 }
  );
}

// ============================================================
// ICP MATCHING
// ============================================================
export async function matchICP(websiteAnalysis: Record<string, unknown> | WebsiteAnalysisResult, senderContext: string): Promise<ICPMatchResult> {
  return gptJSON<ICPMatchResult>(
    `You are a B2B sales strategist specializing in international trade. Your job is to create a precise Ideal Customer Profile (ICP) match.

Think through this systematically:

1. CLASSIFY the buyer type — What ICP category does this prospect fit? Consider:
   - Large distributor (high volume, price-sensitive, logistics-focused)
   - Brand owner (quality-focused, design needs, exclusivity)
   - Project contractor (project-based, deadline-driven, specification-heavy)
   - New importer (risk-averse, needs hand-holding, sample-first)
   - E-commerce seller (fast shipping, good photos, competitive pricing)
   - Chain retailer (volume, consistency, display support)

2. MAP buyer roles — Who makes the purchasing decision? Who influences it?

3. IDENTIFY pain points — What keeps them up at night? Be specific to their business model.

4. FIND triggers — What events would make them actively search for a new supplier RIGHT NOW?

5. UNDERSTAND decision style — Do they decide fast or slow? Committee or individual? Price-first or quality-first?

6. DEVELOP sales angles — For each angle, explain WHY it would resonate with THIS specific prospect.

Sender context:
${senderContext}`,

    `Prospect analysis:\n${JSON.stringify(websiteAnalysis, null, 2)}`,

    {
      name: "icp_match",
      strict: true,
      schema: {
        type: "object",
        properties: {
          icpName: { type: "string", description: "ICP category: distributor, brand_owner, project_contractor, new_importer, small_ecommerce, chain_retailer" },
          buyerRoles: { type: "array", items: { type: "string" }, description: "Decision makers with their likely titles and influence level" },
          painPoints: { type: "array", items: { type: "string" }, description: "Specific pain points relevant to their business model" },
          triggers: { type: "array", items: { type: "string" }, description: "Events that would trigger active supplier search" },
          decisionStyle: { type: "string", description: "How they evaluate and choose suppliers" },
          salesAngles: { type: "array", items: { type: "object", properties: { angle: { type: "string" }, reasoning: { type: "string" } }, required: ["angle", "reasoning"], additionalProperties: false }, description: "Ranked sales approaches with specific reasoning" },
        },
        required: ["icpName", "buyerRoles", "painPoints", "triggers", "decisionStyle", "salesAngles"],
        additionalProperties: false,
      },
    },
    { temperature: 0.4 }
  );
}

// ============================================================
// USP MATCHING
// ============================================================
export async function matchUSP(websiteAnalysis: Record<string, unknown> | WebsiteAnalysisResult, icpMatch: Record<string, unknown> | ICPMatchResult, senderContext: string): Promise<USPMatchResult> {
  return gptJSON<USPMatchResult>(
    `You are a B2B value proposition architect. Your job is to select and frame the most compelling USPs for this specific prospect.

Think through this:

1. REVIEW the sender's capabilities and the prospect's needs
2. SELECT the primary USP — the single most compelling advantage for THIS prospect
3. SELECT the secondary USP — a supporting advantage that reinforces the primary
4. EXPLAIN the fit — why these USPs specifically address this prospect's situation
5. GATHER proof points — concrete evidence (certifications, numbers, case studies) that back up claims
6. CRAFT the email angle:
   - Hook: An opening that references something specific about their business
   - Value statement: How the sender solves their specific problem
   - CTA: A low-friction next step that matches their decision style

The USPs should feel like they were hand-picked for this prospect, not generic marketing copy.

Sender context:
${senderContext}`,

    `Prospect data:\n${JSON.stringify({ websiteAnalysis, icpMatch }, null, 2)}`,

    {
      name: "usp_match",
      strict: true,
      schema: {
        type: "object",
        properties: {
          primaryUsp: { type: "string", description: "The #1 most compelling advantage for this prospect" },
          secondaryUsp: { type: "string", description: "Supporting advantage that reinforces the primary" },
          whyFit: { type: "string", description: "Specific explanation of why these USPs fit this prospect" },
          proofPoints: { type: "array", items: { type: "string" }, description: "Concrete evidence: numbers, certifications, case studies" },
          emailAngle: { type: "object", properties: { hook: { type: "string" }, valueStatement: { type: "string" }, cta: { type: "string" } }, required: ["hook", "valueStatement", "cta"], additionalProperties: false },
        },
        required: ["primaryUsp", "secondaryUsp", "whyFit", "proofPoints", "emailAngle"],
        additionalProperties: false,
      },
    },
    { temperature: 0.5 }
  );
}

// ============================================================
// EMAIL GENERATION
// ============================================================
export async function generateEmail(params: {
  type: 'warm' | 'followup' | 'reply';
  websiteAnalysis: Record<string, unknown> | WebsiteAnalysisResult;
  icpMatch: Record<string, unknown> | ICPMatchResult;
  uspMatch: Record<string, unknown> | USPMatchResult;
  senderContext: string;
  contactName?: string;
  round?: number;
  previousEmails?: Array<{ subject: string; body: string; type: string }>;
  replyContent?: string;
  replyAnalysis?: Record<string, unknown> | ReplyAnalysisResult;
  followupStrategy?: Record<string, unknown>;
}) {
  const { type, websiteAnalysis, icpMatch, uspMatch, senderContext, contactName, round, previousEmails, replyContent, replyAnalysis, followupStrategy } = params;

  let systemPrompt = `You are a world-class B2B cold email copywriter who has written thousands of high-converting outreach emails for international trade companies.

Your writing philosophy:
- Every sentence must earn its place — no filler, no fluff
- Open with something that shows you've done your homework on THEIR business
- Connect their specific situation to a concrete benefit you offer
- Use conversational, human language — write like a knowledgeable peer, not a salesperson
- End with a CTA so easy they'd feel silly saying no

Technical rules:
- Subject line: Under 50 characters, curiosity-driven or value-driven, NO clickbait
- Body: 80-150 words maximum. Every word counts.
- Language: Write in English unless the prospect's website is in another language
- NO generic openers ("I hope this finds you well", "I came across your company")
- NO buzzwords ("synergy", "leverage", "cutting-edge")
- Reference at least ONE specific detail from their website or business

Sender context:
${senderContext}`;

  if (type === 'warm') {
    systemPrompt += `\n\nThis is the FIRST email to this prospect. Your goal is to:
1. Show you understand their business (reference something specific)
2. Bridge to how the sender can help with a specific challenge they likely face
3. Propose a tiny next step (sample, quick call, catalog)

Think about what would make YOU reply if you received this email.`;
  }

  if (type === 'followup' && followupStrategy) {
    systemPrompt += `\n\nThis is follow-up round ${round}. The prospect has NOT replied to previous emails.

Follow-up strategy for this round:
${JSON.stringify(followupStrategy, null, 2)}

Previous emails sent (do NOT repeat the same angles):
${previousEmails?.map((e, i) => `Email ${i + 1} (${e.type}): Subject: ${e.subject}`).join('\n')}

Key principles for follow-ups:
- NEVER just "checking in" or "following up" — always bring new value
- Each follow-up should use a DIFFERENT angle than previous emails
- Increase urgency subtly as rounds progress
- Consider sharing a relevant case study, market insight, or time-sensitive offer`;
  }

  if (type === 'reply' && replyAnalysis) {
    systemPrompt += `\n\nThe prospect has REPLIED. This is huge — they're engaged.

Reply analysis:
${JSON.stringify(replyAnalysis, null, 2)}

Their original reply:
"${replyContent}"

Key principles for reply emails:
- Address EVERY point they raised — missing one signals you don't listen
- If they asked questions, answer directly and specifically
- If they raised objections, acknowledge first, then reframe
- If they showed interest, make the next step crystal clear
- Match their communication style (formal/casual, brief/detailed)
- Hidden concerns are as important as explicit ones — address them subtly`;
  }

  systemPrompt += `\n\nReturn a JSON object with:
- subject (string): Email subject line
- body (string): Email body text (use \\n for line breaks)
- strategyNotes (string): Brief explanation of the strategy and reasoning behind this email`;

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

  const result = await invokeGPT({
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
    temperature: 0.7,
  });
  const content = result.choices[0]?.message?.content;
  return JSON.parse(typeof content === 'string' ? content : '{}') as EmailResult;
}

// ============================================================
// REPLY ANALYSIS
// ============================================================
export async function analyzeReply(replyContent: string, context: { websiteAnalysis: Record<string, unknown>; icpMatch: Record<string, unknown>; previousEmails: Array<{ subject: string; body: string; type: string }> }): Promise<ReplyAnalysisResult> {
  return gptJSON<ReplyAnalysisResult>(
    `You are a senior B2B sales communication analyst. Your job is to decode the prospect's reply and recommend the optimal next move.

Think through this step by step:

1. READ the reply carefully — what are they actually saying?
2. CLASSIFY the reply type:
   - "interested": They want to move forward (asking for samples, pricing, meeting)
   - "objection": They have concerns (price, quality, MOQ, timing)
   - "question": They need more information before deciding
   - "not_interested": Clear rejection
   - "out_of_office": Auto-reply or vacation
   - "referral": They're pointing you to someone else
   - "unclear": Ambiguous response

3. EXTRACT explicit needs — What did they directly ask for or mention?

4. DETECT hidden concerns — What are they worried about but not saying? Read between the lines:
   - "We'll think about it" → They have unresolved concerns
   - "What's your MOQ?" → They might be worried about commitment size
   - "Do you have certifications?" → They've been burned by quality issues before

5. ANALYZE tone — Are they warm, neutral, or cold? Formal or casual? Rushed or thoughtful?

6. RECOMMEND next action — Be specific about WHAT to do and HOW to do it

Context of the conversation:
${JSON.stringify(context, null, 2)}`,

    `Prospect's reply:\n\n"${replyContent}"`,

    {
      name: "reply_analysis",
      strict: true,
      schema: {
        type: "object",
        properties: {
          replyType: { type: "string", description: "interested, objection, question, not_interested, out_of_office, referral, unclear" },
          explicitNeeds: { type: "array", items: { type: "string" }, description: "What they directly asked for" },
          hiddenConcerns: { type: "array", items: { type: "string" }, description: "Underlying worries they didn't explicitly state" },
          recommendedNextAction: { type: "string", description: "Specific, actionable recommendation" },
          toneSummary: { type: "string", description: "Brief assessment of their tone and engagement level" },
        },
        required: ["replyType", "explicitNeeds", "hiddenConcerns", "recommendedNextAction", "toneSummary"],
        additionalProperties: false,
      },
    },
    { temperature: 0.3 }
  );
}
