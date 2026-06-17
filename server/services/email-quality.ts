export type EmailQualityIssueCode =
  | "banned-words"
  | "cta-standalone-line"
  | "word-count"
  | "customer-detail"
  | "peer-caution"
  | "placeholder"
  | "paragraph-density";

export interface EmailQualityIssue {
  code: EmailQualityIssueCode;
  message: string;
  term?: string;
}

export interface EmailQualityInput {
  subject: string;
  body: string;
  customerDetails: string[];
  customerCompany?: string;
  senderCompany?: string;
  bannedTerms?: string[];
  peerCaution?: {
    prohibitedPeerNames: string[];
    isPeerOrCompetitor?: boolean;
  };
}

export interface EmailQualityResult {
  passed: boolean;
  issues: EmailQualityIssue[];
  wordCount: number;
  qualityScore: number;
  warnings: string[];
  shouldRewrite: boolean;
}

const DEFAULT_BANNED_TERMS = [
  "synergy",
  "mutually beneficial",
  "strategic cooperation",
  "strategic collaboration",
  "comprehensive solution",
  "where it makes sense",
  "peer-to-peer discussion",
  "cutting-edge",
  "one-stop",
  "leverage",
  "I hope this email finds you well",
  "Dear Sir/Madam",
];

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function countWords(body: string) {
  const matches = body
    .replace(/https?:\/\/\S+/g, " ")
    .match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g);
  return matches?.length ?? 0;
}

function nonEmptyLines(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikeQuestion(line: string) {
  return /\?$/.test(line.trim()) || /^(should|would|could|want|open to|worth)\b/i.test(line.trim());
}

function containsAnyCustomerDetail(body: string, customerDetails: string[]) {
  const normalizedBody = normalize(body);
  return customerDetails
    .map((detail) => normalize(detail))
    .filter((detail) => detail.length >= 4)
    .some((detail) => normalizedBody.includes(detail));
}

export function evaluateEmailQuality(input: EmailQualityInput): EmailQualityResult {
  const issues: EmailQualityIssue[] = [];
  const body = input.body || "";
  const subject = input.subject || "";
  const wordCount = countWords(body);
  const lowerText = normalize(`${subject}\n${body}`);
  const bannedTerms = [...DEFAULT_BANNED_TERMS, ...(input.bannedTerms ?? [])];

  for (const term of bannedTerms) {
    if (lowerText.includes(normalize(term))) {
      issues.push({
        code: "banned-words",
        message: `Avoid AI or generic sales wording: ${term}`,
        term,
      });
    }
  }

  if (/\[(your name|name|company|contact)\]/i.test(body)) {
    issues.push({
      code: "placeholder",
      message: "Email still contains a placeholder.",
    });
  }

  if (wordCount < 50 || wordCount > 120) {
    issues.push({
      code: "word-count",
      message: `Email should be 50-120 words; current count is ${wordCount}.`,
    });
  }

  const lines = nonEmptyLines(body);
  const lastLine = lines.at(-1) ?? "";
  if (!looksLikeQuestion(lastLine)) {
    issues.push({
      code: "cta-standalone-line",
      message: "CTA must be a low-friction question on its own final line.",
    });
  } else if (countWords(lastLine) > 18 || /[.!]\s+\S.*\?$/.test(lastLine)) {
    issues.push({
      code: "cta-standalone-line",
      message: "CTA is blended into a body paragraph instead of standing alone.",
    });
  } else {
    const priorText = lines.slice(0, -1).join(" ");
    if (priorText.includes(lastLine)) {
      issues.push({
        code: "cta-standalone-line",
        message: "CTA is duplicated or blended into the body copy.",
      });
    }
  }

  if (!containsAnyCustomerDetail(body, input.customerDetails)) {
    issues.push({
      code: "customer-detail",
      message: "Email does not include a concrete customer-specific detail.",
    });
  }

  const paragraphs = body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.some((paragraph) => paragraph.split(/\r?\n/).filter(Boolean).length > 3 || countWords(paragraph) > 65)) {
    issues.push({
      code: "paragraph-density",
      message: "Paragraphs are too dense for cold email scanning.",
    });
  }

  for (const peerName of input.peerCaution?.prohibitedPeerNames ?? []) {
    if (peerName && lowerText.includes(normalize(peerName))) {
      issues.push({
        code: "peer-caution",
        message: `Do not name a specific peer or competitor as proof: ${peerName}`,
        term: peerName,
      });
    }
  }

  if (input.peerCaution?.isPeerOrCompetitor && !/(not a standard supplier pitch|one manufacturer to another|overlap|benchmark|backup|special)/i.test(body)) {
    issues.push({
      code: "peer-caution",
      message: "Peer/competitor outreach must acknowledge the unusual cooperation angle.",
    });
  }

  const qualityScore = Math.max(0, Math.min(100, 100 - issues.length * 15));
  const warnings = issues.map((issue) => issue.message);

  return {
    passed: issues.length === 0,
    issues,
    wordCount,
    qualityScore,
    warnings,
    shouldRewrite: issues.length > 0,
  };
}

export function shouldRewriteEmail(result: EmailQualityResult) {
  return result.shouldRewrite;
}
