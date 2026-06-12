/**
 * LLM Engine - GPT-5.5 powered sales intelligence.
 * All analysis and generation functions use chain-of-thought reasoning
 * with structured JSON output for reliable, intelligent results.
 *
 * 核心理念（借鉴"开发信教练 · Reply-Worthy"方法论）：
 * - 每封邮件的唯一标准：收件人会不会按"回复"
 * - 不写翻译腔，不写群发模板
 * - 先研究客户，再找钩子，最后写信
 * - 像人说话，不像机器人发模板
 */

import { invokeGPT, gptJSON } from "./gpt"
import { getAiPromptSetting } from "../db";

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
  // 新增：更详细的分析字段
  buyerPersona: string;
  recentActivity: string[];
  competitiveContext: string;
  hookOpportunities: string[];
  sourceUrls: string[];
  evidence: WebsiteEvidence[];
  hookEvidence: HookEvidence[];
}

export interface WebsiteEvidence {
  sourceUrl: string;
  pageType: string;
  text: string;
}

export interface HookEvidence {
  hook: string;
  sourceUrl: string;
  evidenceText: string;
}

export interface ICPMatchResult {
  icpName: string;
  buyerRoles: string[];
  painPoints: string[];
  triggers: string[];
  decisionStyle: string;
  salesAngles: Array<{ angle: string; reasoning: string }>;
  // 新增
  communicationStyle: string;
  buyerMindset: string;
  whatTheyWontTell: string[];
}

export interface USPMatchResult {
  primaryUsp: string;
  secondaryUsp: string;
  whyFit: string;
  proofPoints: string[];
  emailAngle: { hook: string; valueStatement: string; cta: string };
  // 新增
  notMassMailProof: string;
  replyTrigger: string;
  avoidPoints: string[];
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

export type EmailQualityReview = {
  passed: boolean;
  blockers: string[];
  warnings: string[];
};

export const FORBIDDEN_COLD_EMAIL_PHRASES = [
  "dear sir",
  "dear madam",
  "dear sir/madam",
  "to whom it may concern",
  "i hope this email finds you well",
  "we are a leading",
  "we are professional",
  "we are manufacturer",
  "we are a manufacturer",
  "we sincerely hope",
  "long-term cooperation",
  "mutually beneficial",
  "win-win",
  "esteemed company",
  "high quality and competitive price",
  "best quality",
  "competitive price",
  "one-stop solution",
  "looking forward to your reply",
  "looking forward to hearing from you",
  "please feel free to contact",
  "if you are interested",
];

const EMAIL_JSON_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    strategyNotes: { type: "string" },
  },
  required: ["subject", "body", "strategyNotes"],
  additionalProperties: false,
} as const;

const COLD_EMAIL_QUALITY_CONTRACT = `
## 绝对质量闸门：不合格就重写

这不是公司简介，也不是产品宣传单。买家只关心：你为什么现在找我、你是否真的了解我、下一步是否足够轻。

硬性失败项：
- 第一句不能介绍自己或公司，必须先说一个客户相关的具体观察。
- 禁止 Dear Sir/Madam、I hope this email finds you well、we are a leading manufacturer、competitive price、one-stop solution、win-win、long-term cooperation、looking forward to your reply 等模板句。
- 不要堆公司资质。资质只能作为一句短证据，且必须服务于当前客户的具体问题。
- 不要写泛泛的 "your company / your business / your products" 开头，除非后面跟着一个具体网页、品类、渠道、市场或业务动作。
- CTA 必须是低摩擦问题，让对方可以用 yes/no 或一个短句回复。不要让对方"安排会议/建立合作/查看完整目录"作为第一步。
- 如果客户和发送方匹配度弱，要诚实转向轻问法，不要硬编关联。

优秀邮件形态：
1. Hook：客户具体细节，1句。
2. Relevance：为什么这件事和我们能帮的一点相关，1句。
3. Proof：一个数字、认证、交期、案例或能力证据，最多1句。
4. CTA：一个低门槛问题，1句。

语言要求：
- 英文像真人销售写给同行，不像中文翻译。
- 80-120词优先，最多150词。
- 每段1-2句，手机上一屏能看完。
- 主语尽量从 buyer / their situation 出发，不要连续自夸 "we/our"。
`;

function countWords(value: string) {
  return (value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) || []).length;
}

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getFirstSubstantiveLine(body: string) {
  const lines = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const first = lines[0] || "";
  if (/^hi\b|^hello\b|^hey\b/i.test(first.replace(/[,!.]+$/, ""))) {
    return lines[1] || first;
  }
  return first;
}

function hasLowFrictionQuestion(body: string) {
  const tail = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" ");
  return /\?/.test(tail) &&
    /(want me to|should i|would it help|worth|open to|can i|may i|does it make sense|useful|send|share|compare|sample|quote)/i.test(tail);
}

export function reviewGeneratedEmailDraft(email: EmailResult, type: "warm" | "followup" | "reply" = "warm"): EmailQualityReview {
  const subject = email.subject || "";
  const body = email.body || "";
  const text = compact(`${subject}\n${body}`);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const bodyWords = countWords(body);
  const nonEmptyLines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const firstContentLine = getFirstSubstantiveLine(body);

  const forbidden = FORBIDDEN_COLD_EMAIL_PHRASES.filter(phrase => text.includes(phrase));
  if (forbidden.length) {
    blockers.push(`包含模板化禁用表达：${forbidden.slice(0, 3).join(", ")}`);
  }

  if (!subject.trim()) {
    blockers.push("缺少主题行");
  } else {
    const subjectWords = countWords(subject);
    if (subjectWords > 7) blockers.push(`主题行超过7词：${subjectWords}词`);
    if (subject.includes("!")) blockers.push("主题行不能使用感叹号");
  }

  if (!body.trim()) {
    blockers.push("缺少邮件正文");
  } else {
    if (bodyWords > 150) blockers.push(`正文超过150词：${bodyWords}词`);
    if (type !== "reply" && bodyWords < 45) warnings.push(`正文偏短：${bodyWords}词，可能缺少足够上下文`);
    if (nonEmptyLines.length > 10) blockers.push("正文段落过多，手机一屏读不完");

    if (/^(we|our company|i am|i'm|my name is|this is)\b/i.test(firstContentLine)) {
      blockers.push("第一句在介绍自己，而不是先给客户相关观察");
    }
    if (/your (company|business|products?|website)\b/i.test(firstContentLine) && !/\b(on|noticed|saw|page|line|range|store|launch|certification|catalog|collection|market)\b/i.test(firstContentLine)) {
      blockers.push("开头过泛，没有足够具体的客户细节");
    }
    if (type !== "reply" && !hasLowFrictionQuestion(body)) {
      blockers.push("缺少低门槛 yes/no 式 CTA 问题");
    }

    const senderMentions = (body.match(/\b(we|our|us|i)\b/gi) || []).length;
    const buyerMentions = (body.match(/\b(you|your|they|their)\b/gi) || []).length;
    if (type !== "reply" && senderMentions > buyerMentions + 4) {
      warnings.push("正文偏卖方视角，可能仍然像公司宣传");
    }
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ============================================================
// EVIDENCE BACKTRACE HELPERS
// ============================================================

const URL_PATTERN = /https?:\/\/[^\s)\]}>"']+/gi;
const MAX_ANALYSIS_EVIDENCE = 24;
const MAX_EMAIL_HOOK_EVIDENCE = 8;

const HIGH_VALUE_EVIDENCE_TERMS = [
  "product",
  "products",
  "collection",
  "collections",
  "catalog",
  "case study",
  "project",
  "projects",
  "certified",
  "certification",
  "sustainable",
  "sustainability",
  "launch",
  "new",
  "distributor",
  "wholesale",
  "retail",
  "installer",
  "contractor",
  "delivery",
  "in-stock",
  "warehouse",
  "showroom",
  "market",
  "premium",
  "eco",
  "commercial",
  "residential",
];

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function trimEvidenceText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function evidenceScore(text: string) {
  const normalized = compact(text);
  return HIGH_VALUE_EVIDENCE_TERMS.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function splitEvidenceCandidates(line: string) {
  const normalized = trimEvidenceText(line);
  if (!normalized || normalized.length < 35) return [];

  const sentences = normalized.split(/(?<=[.!?])\s+/).map(trimEvidenceText).filter(Boolean);
  if (sentences.length > 1) {
    return sentences.filter(sentence => sentence.length >= 35);
  }

  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += 220) {
    const chunk = trimEvidenceText(normalized.slice(index, index + 220));
    if (chunk.length >= 35) chunks.push(chunk);
  }
  return chunks;
}

function parseExplicitEvidenceLine(line: string, fallbackUrl: string, fallbackPageType: string): WebsiteEvidence {
  const explicitSource = line.match(/\(source:\s*(https?:\/\/[^)\s]+)\s*\)/i)?.[1] || "";
  const evidenceType = line.match(/^-\s*\[([^\]]+)\]/)?.[1]?.trim().toLowerCase().replace(/\s+/g, "_") || fallbackPageType;
  const text = trimEvidenceText(
    line
      .replace(/^-\s*\[[^\]]+\]\s*/, "")
      .replace(/\(source:\s*https?:\/\/[^)]+\)\s*/i, ""),
  );

  return {
    sourceUrl: explicitSource || fallbackUrl,
    pageType: evidenceType,
    text,
  };
}

export function buildWebsiteEvidenceInput(scrapedContent: string) {
  const allUrls = uniqueStrings(scrapedContent.match(URL_PATTERN) || []);
  const rootUrl = scrapedContent.match(/^=== Website Analysis:\s*(.+?)\s*===/m)?.[1]?.trim();
  const sourceUrls = uniqueStrings([rootUrl || "", ...allUrls]);
  let currentUrl = rootUrl || sourceUrls[0] || "unknown";
  let currentPageType = "homepage";

  const candidates: WebsiteEvidence[] = [];
  for (const rawLine of scrapedContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const pageMatch = line.match(/^---\s*([A-Z0-9 _-]+)\s+Page\s+\((https?:\/\/[^)]+)\)\s*---$/i);
    if (pageMatch) {
      currentPageType = pageMatch[1].toLowerCase().replace(/\s+/g, "_");
      currentUrl = pageMatch[2];
      continue;
    }

    if (/^---/.test(line) || /^===/.test(line)) continue;

    const parsedLine = parseExplicitEvidenceLine(line, currentUrl, currentPageType);
    const sourceUrl = parsedLine.sourceUrl;
    const pageType = parsedLine.pageType;
    const normalizedLine = parsedLine.text || line;
    const isMetadataSignal = /^(title|description|key headings):/i.test(normalizedLine);
    for (const snippet of splitEvidenceCandidates(normalizedLine)) {
      const score = evidenceScore(snippet);
      if (!isMetadataSignal && score === 0 && candidates.filter(item => item.sourceUrl === sourceUrl).length >= 2) continue;
      candidates.push({
        sourceUrl,
        pageType,
        text: snippet,
      });
    }
  }

  const evidence = candidates
    .sort((left, right) => evidenceScore(right.text) - evidenceScore(left.text))
    .slice(0, MAX_ANALYSIS_EVIDENCE);

  const evidencePack = {
    sourceUrls,
    evidence,
  };

  return {
    sourceUrls,
    evidence,
    modelInput: evidence.length
      ? `STRUCTURED_EVIDENCE_JSON:\n${JSON.stringify(evidencePack, null, 2)}\n\nRAW_SCRAPED_CONTENT:\n${scrapedContent}`
      : scrapedContent,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractFirstUrl(value: string) {
  return value.match(URL_PATTERN)?.[0] || "";
}

export function collectHookEvidenceForPrompt(websiteAnalysis: Record<string, unknown> | WebsiteAnalysisResult): HookEvidence[] {
  const hooks: HookEvidence[] = [];
  const hookEvidence = Array.isArray(websiteAnalysis.hookEvidence) ? websiteAnalysis.hookEvidence : [];
  for (const item of hookEvidence) {
    if (!isRecord(item)) continue;
    const hook = readString(item.hook);
    const sourceUrl = readString(item.sourceUrl);
    const evidenceText = readString(item.evidenceText);
    if (hook && sourceUrl && evidenceText) hooks.push({ hook, sourceUrl, evidenceText });
  }

  const hookOpportunities = Array.isArray(websiteAnalysis.hookOpportunities) ? websiteAnalysis.hookOpportunities : [];
  for (const item of hookOpportunities) {
    const hook = readString(item);
    const sourceUrl = extractFirstUrl(hook);
    if (hook && sourceUrl) hooks.push({ hook, sourceUrl, evidenceText: hook });
  }

  const evidence = Array.isArray(websiteAnalysis.evidence) ? websiteAnalysis.evidence : [];
  for (const item of evidence) {
    if (!isRecord(item)) continue;
    const evidenceText = readString(item.text);
    const sourceUrl = readString(item.sourceUrl);
    if (evidenceText && sourceUrl) hooks.push({ hook: evidenceText, sourceUrl, evidenceText });
  }

  const seen = new Set<string>();
  return hooks.filter(item => {
    const key = `${item.sourceUrl}\n${item.evidenceText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_EMAIL_HOOK_EVIDENCE);
}

export function buildHookEvidencePromptClause(hookEvidence: HookEvidence[]) {
  if (!hookEvidence.length) {
    return `## 非群发 hook 证据规则
- 当前客户资料没有可回溯的 hookEvidence。不要编造具体网页细节、活动、产品线或认证。
- 如果证据不足，第一句只能使用低风险观察，并在 strategyNotes 写明"缺少可验证网站证据"。`;
  }

  return `## 非群发 hook 证据规则
- 第一封开发信的开场 hook 必须来自 hookEvidenceForEmail 中的一条证据。
- 不允许把没有 sourceUrl 支撑的猜测写成客户事实。
- strategyNotes 必须写明本次使用的 hook 来源 URL。
- 如果 hookEvidenceForEmail 与我方产品无关，宁可轻问或建议跳过，不要硬编关联。`;
}

// ============================================================
// WEBSITE ANALYSIS（网站深度分析）
// ============================================================

export async function analyzeWebsite(scrapedContent: string, senderContext: string): Promise<WebsiteAnalysisResult> {
  const evidenceInput = buildWebsiteEvidenceInput(scrapedContent);

  return gptJSON<WebsiteAnalysisResult>(
    `你是一位拥有15年国际贸易经验的B2B销售情报分析师。你的任务是深度分析目标客户的网站，为后续写开发信提供精准情报。

你的分析必须回答一个核心问题：**这家公司现在最在意什么？我们有没有机会？**

## 证据优先原则（强制）
- 如果输入中包含 STRUCTURED_EVIDENCE_JSON，必须优先使用其中的 evidence/sourceUrls，再参考 RAW_SCRAPED_CONTENT。
- 每个"非群发"开发信 hook 必须能追溯到一个 sourceUrl 和一段 evidenceText。
- hookOpportunities 每条都要包含可验证来源，例如："客户新增 hotel renovation project 页面 [source: https://...]"。
- hookEvidence 必须只记录有网页证据支撑的 hook；没有证据就返回空数组，不要补脑。
- 不允许把行业常识、猜测、我方卖点包装成客户网站事实。

请按以下步骤系统分析：

## 第一步：公司基本画像
- 公司名称、国家、所在行业细分领域
- 商业模式分类：经销商/品牌商/项目承包商/零售商/电商卖家/制造商？
- 主要产品线和重点品类
- 市场定位：高端/中端/平价？成长期还是成熟期？

## 第二步：关键业务信号挖掘（重点！）
仔细寻找以下"非群发"钩子：
- 最近是否有新店开业、新产品线、新市场扩张？
- 网站上是否有招聘信息暗示业务扩张方向？
- 是否强调某些认证、标准或环保要求？
- 定价策略关键词（如"everyday low prices", "premium quality"等）
- 他们的供应链诉求（是否提到"in-stock", "fast delivery", "direct from manufacturer"）

## 第三步：采购意图评估
- 根据具体证据（不是猜测）打分1-10
- 列出所有触发采购决策的可能事件
- 评估他们目前是否在主动寻找新供应商

## 第四步：邮件钩子机会（最关键）
找出2-3个能证明"这封邮件不是群发"的具体细节。比如：
- 他们网站上某个具体的产品页面或促销活动
- 某个具体的业务扩张动作
- 某个他们强调但可能遇到供应挑战的品类

## 第五步：与发送方的匹配度评估（最诚实的一步！）
- 发送方的产品/服务与这个客户的核心业务有多大关联？
- 如果发送方卖地板，客户是SaaS公司，匹配度就是1-2分——不要假装有关联
- 如果匹配度低于5分，诚实说明"这不是我们的理想目标客户"
- 如果匹配度在5-7之间，寻找间接切入点（如办公室装修、仓库地面等）
- 绝对不要强行建立不存在的联系！宁可说"不匹配"也不要编造关联
- 在hookOpportunities中，如果找不到真实的钩子，写"未找到与发送方产品相关的钩子"

发送方（我方）背景信息：
${senderContext}

所有结论必须有网站内容作为依据。如果信息不足，直接说"未找到相关信息"，不要编造。`,
    `请分析以下网站内容：\n\n${evidenceInput.modelInput}`,
    {
      name: "website_analysis",
      strict: true,
      schema: {
        type: "object",
        properties: {
          industry: { type: "string", description: "具体行业细分，如'地板经销'而非笼统的'建材'" },
          businessModel: { type: "string", description: "商业模式：distributor/brand_owner/project_contractor/retailer/ecommerce/manufacturer/wholesaler" },
          productFocus: { type: "string", description: "主要产品线和重点品类描述" },
          marketPosition: { type: "string", description: "市场定位、竞争优势和发展阶段" },
          websiteSignals: { type: "array", items: { type: "string" }, description: "网站上发现的具体采购信号和业务动向" },
          purchaseIntentScore: { type: "number", description: "采购意图评分1-10，必须基于具体证据" },
          triggerEvents: { type: "array", items: { type: "string" }, description: "可能触发采购决策的事件" },
          companyName: { type: "string" },
          country: { type: "string" },
          rawSummary: { type: "string", description: "2-3句话的核心发现摘要" },
          buyerPersona: { type: "string", description: "买家画像：这类公司的采购决策者通常是什么角色、关心什么" },
          recentActivity: { type: "array", items: { type: "string" }, description: "最近的业务动态（新店、新产品、扩张等）" },
          competitiveContext: { type: "string", description: "他们面临的竞争环境和供应链挑战" },
          hookOpportunities: { type: "array", items: { type: "string" }, description: "可以用在开发信开头的具体钩子。每条必须包含[source: URL]；没有证据不要写" },
          sourceUrls: { type: "array", items: { type: "string" }, description: "本次分析实际引用的网站来源URL" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sourceUrl: { type: "string" },
                pageType: { type: "string" },
                text: { type: "string" },
              },
              required: ["sourceUrl", "pageType", "text"],
              additionalProperties: false,
            },
            description: "支撑分析结论的网页证据片段",
          },
          hookEvidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                hook: { type: "string" },
                sourceUrl: { type: "string" },
                evidenceText: { type: "string" },
              },
              required: ["hook", "sourceUrl", "evidenceText"],
              additionalProperties: false,
            },
            description: "可直接用于开发信开场的hook及其网页证据。没有证据时返回空数组",
          },
        },
        required: ["industry", "businessModel", "productFocus", "marketPosition", "websiteSignals",
          "purchaseIntentScore", "triggerEvents", "companyName", "country", "rawSummary",
          "buyerPersona", "recentActivity", "competitiveContext", "hookOpportunities",
          "sourceUrls", "evidence", "hookEvidence"],
        additionalProperties: false,
      },
    },
    { temperature: 0.3 }
  );
}

// ============================================================
// ICP MATCHING（客户画像匹配）
// ============================================================

export async function matchICP(websiteAnalysis: Record<string, unknown> | WebsiteAnalysisResult, senderContext: string): Promise<ICPMatchResult> {
  return gptJSON<ICPMatchResult>(
    `你是一位专注国际贸易的B2B销售策略师。你的任务是精准匹配客户画像（ICP），为写开发信提供策略支撑。

核心目标：搞清楚**这个人收到邮件时脑子里在想什么**，然后我们才能写出让他想回复的内容。

请按以下框架分析：

## 第一步：买家类型分类
这个客户属于哪种ICP？
- 大型经销商：量大、价格敏感、关注物流和库存
- 品牌商：品质优先、有设计需求、可能要求独家
- 项目承包商：以项目为单位采购、有deadline压力、看规格
- 新入行进口商：风险厌恶、需要手把手指导、先要样品
- 电商卖家：要快速发货、好图片、有竞争力的价格
- 连锁零售商：要量、要一致性、要陈列支持

## 第二步：决策链条分析
- 谁是最终拍板的人？（职位、角色）
- 谁有影响力但不拍板？
- 他们的决策风格：快决策还是慢流程？价格优先还是品质优先？

## 第三步：痛点深挖（关键！）
不要写泛泛的痛点。要具体到：
- 他们每天在头疼什么？
- 什么情况下他们会主动去找新供应商？
- 他们上一个供应商可能让他们失望在哪里？

## 第四步：他们不会告诉你的事
买家不会在邮件里承认的担心：
- "你们中国工厂质量到底行不行？"
- "你是不是同时也在供货给我的竞争对手？"
- "交了定金你会不会跑路？"
识别这些潜在顾虑，后续邮件要含蓄地化解。

## 第五步：沟通风格判断
- 美国买家、欧洲买家、中东买家的沟通偏好差异
- 这类买家喜欢什么样的邮件风格？
- 什么语气会让他们觉得"这个供应商靠谱"？

## 第六步：销售角度设计
给出2-3个可行的销售角度，每个角度都要说清楚**为什么对这个特定客户有效**。

发送方背景：
${senderContext}`,
    `客户分析资料：\n${JSON.stringify(websiteAnalysis, null, 2)}`,
    {
      name: "icp_match",
      strict: true,
      schema: {
        type: "object",
        properties: {
          icpName: { type: "string", description: "ICP类别：distributor/brand_owner/project_contractor/new_importer/small_ecommerce/chain_retailer" },
          buyerRoles: { type: "array", items: { type: "string" }, description: "决策链上的关键人物及其职位和影响力" },
          painPoints: { type: "array", items: { type: "string" }, description: "具体、深入的痛点（不要泛泛而谈）" },
          triggers: { type: "array", items: { type: "string" }, description: "会触发他们主动找新供应商的事件" },
          decisionStyle: { type: "string", description: "决策风格和评估供应商的方式" },
          salesAngles: {
            type: "array",
            items: {
              type: "object",
              properties: { angle: { type: "string" }, reasoning: { type: "string" } },
              required: ["angle", "reasoning"],
              additionalProperties: false,
            },
            description: "针对这个客户的销售角度及具体理由",
          },
          communicationStyle: { type: "string", description: "推荐的沟通风格（语气、正式度、详略程度）" },
          buyerMindset: { type: "string", description: "买家收到邮件时的心理状态和关注焦点" },
          whatTheyWontTell: { type: "array", items: { type: "string" }, description: "买家不会主动说出但实际在担心的事" },
        },
        required: ["icpName", "buyerRoles", "painPoints", "triggers", "decisionStyle",
          "salesAngles", "communicationStyle", "buyerMindset", "whatTheyWontTell"],
        additionalProperties: false,
      },
    },
    { temperature: 0.4 }
  );
}

// ============================================================
// USP MATCHING（卖点匹配）
// ============================================================

export async function matchUSP(
  websiteAnalysis: Record<string, unknown> | WebsiteAnalysisResult,
  icpMatch: Record<string, unknown> | ICPMatchResult,
  senderContext: string,
): Promise<USPMatchResult> {
  return gptJSON<USPMatchResult>(
    `你是一位B2B价值主张架构师，专注于帮中国外贸企业找到最打动海外买家的卖点组合。

核心原则：**不是列出我们有什么，而是找到对方最需要什么，然后精准匹配。**

请按以下步骤思考：

⚠️ 重要前提：在开始匹配之前，先问自己一个问题——
**发送方的产品/服务和这个客户的核心业务到底有没有关系？**
如果客户是一家SaaS公司，而我们卖地板，那就不要硬说"你们办公室需要地板"。
匹配度判断：
- 高匹配（7-10）：客户直接需要我们的产品 → 正常推进
- 中匹配（4-6）：有间接关联 → 用重定向策略找间接切入点
- 低匹配（1-3）：基本无关 → 建议跳过此客户，不要浪费开发信资源
## 第一步：需求-能力匹配
- 回顾客户的核心需求和痛点
- 从发送方的能力中挑出最匹配的1-2个卖点
- 这些卖点必须能直接解决客户的具体问题

## 第二步：主次USP选择
- 主USP：对这个客户最致命的一个优势（只选一个！）
- 辅助USP：加强主USP说服力的第二优势
- 解释为什么这个组合对这个特定客户有效

## 第三步：证据准备
- 找出能支撑USP的具体证据（认证、数字、案例）
- 这些证据必须是可验证的，不是空话
- 优先选择与客户行业直接相关的证据

## 第四步：邮件角度设计（最关键！）
遵循"开发信教练"方法论：
- **钩子（Hook）**：优先使用 websiteAnalysis.hookEvidence/sourceUrls 中有来源证据的客户网站细节，证明你做了功课，这不是群发
- **价值陈述**：一句话说清楚你能解决他什么问题（像人说话，不像广告）
- **CTA**：压到最低门槛，让对方能"秒回"（比如"要不要我发个对比报价？"而不是"期待与您合作"）
- 如果没有可回溯证据，不要编造客户具体动作；emailAngle.hook 写成轻量、诚实的观察。

## 第五步：避坑清单
列出这封邮件绝对不能出现的内容：
- 什么卖点虽然我们有但对这个客户没用？
- 什么表述方式会让买家觉得"又是群发"？
- 什么CTA会让对方觉得门槛太高不想回？

发送方背景：
${senderContext}`,
    `客户资料：\n${JSON.stringify({ websiteAnalysis, icpMatch }, null, 2)}`,
    {
      name: "usp_match",
      strict: true,
      schema: {
        type: "object",
        properties: {
          primaryUsp: { type: "string", description: "主USP：对这个客户最有杀伤力的一个优势" },
          secondaryUsp: { type: "string", description: "辅助USP：强化主USP的第二优势" },
          whyFit: { type: "string", description: "为什么这个USP组合特别适合这个客户" },
          proofPoints: { type: "array", items: { type: "string" }, description: "支撑USP的具体证据" },
          emailAngle: {
            type: "object",
            properties: {
              hook: { type: "string", description: "基于客户网站细节的开场钩子" },
              valueStatement: { type: "string", description: "一句话价值陈述（像人说话）" },
              cta: { type: "string", description: "低门槛CTA（能秒回的动作）" },
            },
            required: ["hook", "valueStatement", "cta"],
            additionalProperties: false,
          },
          notMassMailProof: { type: "string", description: "这封邮件不是群发的证据（引用的具体客户细节）" },
          replyTrigger: { type: "string", description: "最可能触发对方回复的点是什么" },
          avoidPoints: { type: "array", items: { type: "string" }, description: "这封邮件必须避免的内容和表述" },
        },
        required: ["primaryUsp", "secondaryUsp", "whyFit", "proofPoints", "emailAngle",
          "notMassMailProof", "replyTrigger", "avoidPoints"],
        additionalProperties: false,
      },
    },
    { temperature: 0.5 }
  );
}

// ============================================================
// EMAIL GENERATION（邮件生成 - 核心升级）
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
  const {
    type,
    websiteAnalysis,
    icpMatch,
    uspMatch,
    senderContext,
    contactName,
    round,
    previousEmails,
    replyContent,
    replyAnalysis,
    followupStrategy,
  } = params;
  const hookEvidenceForEmail = collectHookEvidenceForPrompt(websiteAnalysis);

  const promptKey =
    type === 'warm' ? 'email.warm' :
    type === 'followup' ? 'email.followup' : 'email.reply';
  const promptOverride = await getAiPromptSetting(promptKey);

  let systemPrompt = promptOverride?.promptText?.trim() ||
    `你是一位顶级B2B开发信写手，专门帮中国外贸企业写让海外买家真的愿意回复的英文开发信。

## 你的写作哲学（"开发信教练"方法论）

### 核心信条
只看一件事——**收件人会不会按"回复"**。不是"看起来很正式"，不是"信息很全面"，而是对方读完后会不会想回你。

### 六大铁律

**1. 不写翻译腔**
- 不用"Dear Sir/Madam"、"I hope this email finds you well"
- 不用中式英语结构（"We are a leading manufacturer of..."）
- 写出来要像一个英语母语的销售在跟同行聊天

**2. 不写群发模板**
- 开头必须提到对方公司/网站上的一个具体细节
- 这个细节要具体到对方一看就知道"你真的看过我网站"
- 绝不用任何人都能收到的泛泛开场

**3. 一封邮件只卖一个点**
- 不要把所有卖点都塞进去
- 选最能打动这个特定客户的一个USP
- 其他卖点留给后续跟进

**4. 像人说话**
- 短句为主，长句不超过20词
- 用具体数字代替形容词（"3天出样"比"fast sample delivery"好）
- 避免所有营销味道的词（synergy, leverage, cutting-edge, one-stop）

**5. CTA必须低门槛**
- 不要"期待与您合作"、"looking forward to your reply"
- 要"Want me to send a comparison quote?"、"Should I ship 2 samples to your office?"
- 让对方只需要回复一个词就能推进

**6. 控制长度**
- 主题行：7个词以内，不用感叹号
- 正文：80-120词，绝对不超过150词
- 每段不超过2-3句
- 整封邮件在手机屏幕上一屏看完

**7. 诚实匹配，不强行关联**
- 如果发送方的产品和客户的核心业务没有直接关系，不要编造关联
- 地板公司给SaaS公司写信，不要说"你们的服务器房需要高质量地板"
- 宁可建议重定向（如“您是否有客户涉及建筑/装修行业？”），也不要强行建立不存在的联系

**8. 写完后自我检查**
- 这封邮件收件人看到后会觉得"这人真的了解我的业务"还是"这又是一封群发垃圾邮件"？
- 如果答案是后者，重新写或建议跳过这个客户
- 检查是否有任何"强行关联"的语句，如果有，删除并替换为真实的价值主张

### 写作框架
1. **钩子句**（1句）：提到对方业务的一个具体细节，证明你做了功课
2. **桥接句**（1-2句）：从他们的情况自然过渡到你能提供的价值
3. **价值锤**（1-2句）：用一个USP+具体数据说明你能解决什么问题
4. **信任点**（0-1句）：一个简短的证据（认证/数字/案例），不是自吹
5. **CTA**（1句）：一个具体的、低门槛的下一步

发送方背景信息：

重要：在邮件结尾的签名处，使用发送方背景信息中的"Sender Name"作为署名。绝对不要使用"[Your Name]"或其他占位符。如果Sender Name为空，则不添加个人署名，只保留公司信息。
${senderContext}`;

  systemPrompt += `

${COLD_EMAIL_QUALITY_CONTRACT}

发送方背景信息（必须以此为准，不能编造）：
${senderContext}`;

  if (type === 'warm') {
    systemPrompt += `

## 这是第一封开发信（warm email）

目标：让对方在3秒内决定"这封值得回"。

写信前先想清楚三个问题：
1. 对方网站上什么细节能证明我不是群发？
2. 我的哪一个优势能直接解决他现在的问题？
3. 什么样的CTA他只需要回复一个词？

记住：第一封信的任务不是成交，是开启对话。`;
  }

  if (type !== 'reply') {
    systemPrompt += `

${buildHookEvidencePromptClause(hookEvidenceForEmail)}`;
  }

  if (type === 'followup' && followupStrategy) {
    systemPrompt += `

## 这是第${round}封跟进邮件

前序邮件未获回复。跟进策略：
${JSON.stringify(followupStrategy, null, 2)}

已发邮件（不要重复同样的角度）：
${previousEmails?.map((e, i) => `第${i + 1}封 (${e.type}): 主题: ${e.subject}`).join('\n')}

跟进铁律：
- 绝不"just checking in"或"following up"——每次都要带新价值
- 每封跟进用不同角度（新案例、市场信息、限时优惠等）
- 可以适度增加紧迫感，但不要假装紧急
- 考虑分享一个对方行业的有价值信息（不是推销）`;
  }

  if (type === 'reply' && replyAnalysis) {
    systemPrompt += `

## 对方已经回复了！这很关键。

回复分析：
${JSON.stringify(replyAnalysis, null, 2)}

对方原文：
"${replyContent}"

回复邮件铁律：
- 对方提到的每一个点都要回应——漏一个就说明你不认真听
- 问题直接回答，不绕弯子
- 如果有异议，先认可再重新框架
- 如果表示兴趣，立刻明确下一步
- 匹配对方的沟通风格（正式/随意、简短/详细）
- 潜在顾虑和明说的需求同样重要——含蓄地化解`;
  }

  systemPrompt += `

## 输出格式
返回JSON对象，包含：
- subject (string): 邮件主题行（英文，7词以内，不用感叹号）
- body (string): 邮件正文（英文，80-120词，用\\n换行）
- strategyNotes (string): 中文策略说明——解释为什么选这个钩子、这个USP、这个CTA，以及预判对方可能的回复方向`;

  const userContent: Record<string, unknown> = {
    emailType: type,
    contactName: contactName || 'there',
    websiteAnalysis,
    hookEvidenceForEmail,
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
      { role: "user", content: JSON.stringify(userContent) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "email_generation",
        strict: true,
        schema: EMAIL_JSON_SCHEMA,
      },
    },
    temperature: 0.55,
  });

  const content = result.choices[0]?.message?.content;
  let emailResult = JSON.parse(typeof content === 'string' ? content : '{}') as EmailResult;
  let quality = reviewGeneratedEmailDraft(emailResult, type);

  if (!quality.passed) {
    const rewriteResult = await invokeGPT({
      messages: [
        {
          role: "system",
          content: `${systemPrompt}

## 重写任务
上一版邮件没有通过质量闸门。你必须只输出一版更强的英文邮件，不要解释，不要保留失败表达。

修复优先级：
1. 先用客户具体细节开场，不要先介绍我方。
2. 删掉所有模板话、公司宣传味、翻译腔。
3. 保留一个最相关卖点和一个短证据。
4. 结尾必须是低门槛问题，让对方能一词回复。
5. 主题7词以内，正文80-120词优先。`,
        },
        {
          role: "user",
          content: JSON.stringify({
            emailType: type,
            contactName: contactName || "there",
            websiteAnalysis,
            hookEvidenceForEmail,
            icpMatch,
            uspMatch,
            previousEmails,
            replyContent,
            replyAnalysis,
            followupStrategy,
            failedDraft: emailResult,
            qualityBlockers: quality.blockers,
            qualityWarnings: quality.warnings,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_generation_rewrite",
          strict: true,
          schema: EMAIL_JSON_SCHEMA,
        },
      },
      temperature: 0.35,
    });

    const rewriteContent = rewriteResult.choices[0]?.message?.content;
    emailResult = JSON.parse(typeof rewriteContent === "string" ? rewriteContent : "{}") as EmailResult;
    quality = reviewGeneratedEmailDraft(emailResult, type);
  }

  if (!quality.passed || quality.warnings.length) {
    emailResult.strategyNotes = [
      emailResult.strategyNotes,
      quality.passed ? null : `质量闸门仍需人工复核：${quality.blockers.join("；")}`,
      quality.warnings.length ? `质量提醒：${quality.warnings.join("；")}` : null,
    ].filter(Boolean).join("\n");
  }

  return emailResult;
}

// ============================================================
// REPLY ANALYSIS（回复分析）
// ============================================================

export async function analyzeReply(
  replyContent: string,
  context: {
    websiteAnalysis: Record<string, unknown>;
    icpMatch: Record<string, unknown>;
    previousEmails: Array<{ subject: string; body: string; type: string }>;
  },
): Promise<ReplyAnalysisResult> {
  return gptJSON<ReplyAnalysisResult>(
    `你是一位资深B2B销售沟通分析师。你的任务是解读客户回复中的真实意图，并给出最优的下一步建议。

请按以下步骤分析：

## 第一步：仔细阅读回复
- 他们到底在说什么？
- 语气如何？热情/中性/冷淡？正式/随意？

## 第二步：回复类型判断
- "interested"（感兴趣）：要样品、要报价、要开会
- "objection"（有异议）：对价格/质量/MOQ/交期有顾虑
- "question"（需要更多信息）：还在评估阶段
- "not_interested"（明确拒绝）
- "out_of_office"（自动回复/休假）
- "referral"（转介给其他人）
- "unclear"（模糊回复）

## 第三步：读出话外之音
买家不会直接说的担心：
- "We'll think about it" → 还有没解决的顾虑
- "What's your MOQ?" → 可能担心数量太大
- "Do you have certifications?" → 之前被品质问题坑过
- "Can you send a catalog?" → 可能只是礼貌性回复，兴趣不大
- 简短回复 → 可能很忙或者兴趣一般

## 第四步：制定回复策略
给出具体、可执行的建议：
- 回复什么内容？
- 用什么语气？
- 有没有需要额外准备的材料？

对话上下文：
${JSON.stringify(context, null, 2)}`,
    `客户的回复内容：\n\n"${replyContent}"`,
    {
      name: "reply_analysis",
      strict: true,
      schema: {
        type: "object",
        properties: {
          replyType: { type: "string", description: "回复类型：interested/objection/question/not_interested/out_of_office/referral/unclear" },
          explicitNeeds: { type: "array", items: { type: "string" }, description: "明确提出的需求" },
          hiddenConcerns: { type: "array", items: { type: "string" }, description: "话外之音——没说出口的担心" },
          recommendedNextAction: { type: "string", description: "具体的下一步建议" },
          toneSummary: { type: "string", description: "语气和参与度评估" },
        },
        required: ["replyType", "explicitNeeds", "hiddenConcerns", "recommendedNextAction", "toneSummary"],
        additionalProperties: false,
      },
    },
    { temperature: 0.3 }
  );
}
