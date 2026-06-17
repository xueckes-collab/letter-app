import { existsSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";

type EmailQualityIssue = {
  code?: string;
  ruleId?: string;
  message?: string;
  term?: string;
};

type EmailQualityResult = {
  passed: boolean;
  issues: EmailQualityIssue[];
  wordCount?: number;
};

type EmailQualityInput = {
  subject: string;
  body: string;
  customerDetails: string[];
  customerCompany?: string;
  senderCompany?: string;
  bannedTerms?: string[];
  peerCaution?: {
    prohibitedPeerNames: string[];
  };
};

type EvaluateEmailQuality = (input: EmailQualityInput) => EmailQualityResult;

const moduleExists = existsSync(new URL("./email-quality.ts", import.meta.url));
const describeIfExported = moduleExists ? describe : describe.skip;

let evaluateEmailQuality: EvaluateEmailQuality;

function issueCodes(result: EmailQualityResult): string[] {
  return result.issues.map((issue) => issue.code ?? issue.ruleId ?? "");
}

function expectIssue(result: EmailQualityResult, expectedCode: string) {
  expect(result.passed).toBe(false);
  expect(issueCodes(result)).toContain(expectedCode);
}

function expectNoIssue(result: EmailQualityResult, unexpectedCode: string) {
  expect(issueCodes(result)).not.toContain(unexpectedCode);
}

function makeBody(wordCount: number, finalLine = "Want me to send two sample finishes?") {
  const words = Array.from({ length: wordCount - 7 }, (_, index) => `word${index + 1}`);
  return `${words.join(" ")}\n\n${finalLine}`;
}

describeIfExported("email-quality pure rules", () => {
  beforeAll(async () => {
    const modulePath = "./email-quality";
    const mod = (await import(modulePath)) as {
      evaluateEmailQuality?: EvaluateEmailQuality;
    };

    if (typeof mod.evaluateEmailQuality !== "function") {
      throw new Error("server/services/email-quality.ts must export evaluateEmailQuality");
    }

    evaluateEmailQuality = mod.evaluateEmailQuality;
  });

  it("flags banned sales and marketing terms", () => {
    const result = evaluateEmailQuality({
      subject: "Cutting-edge flooring solution",
      body: [
        "Hi Maya,",
        "",
        "I noticed the Boulder showroom added acoustic wall panels last month.",
        "Our cutting-edge one-stop solution can help you leverage synergy across every project.",
        "",
        "Want me to send two sample finishes?",
      ].join("\n"),
      customerDetails: ["Boulder showroom", "acoustic wall panels"],
      bannedTerms: ["cutting-edge", "one-stop", "leverage", "synergy"],
    });

    expectIssue(result, "banned-words");
    expect(result.issues.some((issue) => issue.term === "cutting-edge")).toBe(true);
  });

  it("requires the CTA to be on its own final line", () => {
    const result = evaluateEmailQuality({
      subject: "Acoustic panel samples",
      body: [
        "Hi Maya,",
        "",
        "I noticed the Boulder showroom added acoustic wall panels last month, and we make FSC oak panels for retail fit-outs. Want me to send two sample finishes?",
      ].join("\n"),
      customerDetails: ["Boulder showroom", "acoustic wall panels"],
    });

    expectIssue(result, "cta-standalone-line");
  });

  it("accepts a low-friction CTA when it is separated from the body copy", () => {
    const result = evaluateEmailQuality({
      subject: "Acoustic panel samples",
      body: [
        "Hi Maya,",
        "",
        "I noticed the Boulder showroom added acoustic wall panels last month.",
        "We make FSC oak panels for retail fit-outs and can match your current walnut and natural oak range.",
        "",
        "Want me to send two sample finishes?",
      ].join("\n"),
      customerDetails: ["Boulder showroom", "acoustic wall panels"],
    });

    expectNoIssue(result, "cta-standalone-line");
  });

  it("flags bodies outside the target word-count range", () => {
    const shortResult = evaluateEmailQuality({
      subject: "Acoustic panel samples",
      body: makeBody(45),
      customerDetails: ["Boulder showroom"],
    });

    const longResult = evaluateEmailQuality({
      subject: "Acoustic panel samples",
      body: makeBody(151),
      customerDetails: ["Boulder showroom"],
    });

    expectIssue(shortResult, "word-count");
    expectIssue(longResult, "word-count");
    expect(longResult.wordCount).toBeGreaterThan(150);
  });

  it("requires at least one concrete customer detail", () => {
    const result = evaluateEmailQuality({
      subject: "New sample options",
      body: [
        "Hi Maya,",
        "",
        "I saw your company has a wide product range, and our factory could be a strong fit.",
        "We can support retail partners with stable lead times and small trial runs.",
        "",
        "Want me to send two sample finishes?",
      ].join("\n"),
      customerDetails: ["Boulder showroom", "acoustic wall panels"],
    });

    expectIssue(result, "customer-detail");
  });

  it("flags named peer references while allowing generic peer proof", () => {
    const namedPeerResult = evaluateEmailQuality({
      subject: "Retail fit-out samples",
      body: [
        "Hi Maya,",
        "",
        "I noticed the Boulder showroom added acoustic wall panels last month.",
        "StoneWorks Supply switched to our panels last year, and we can do the same for your retail fit-outs.",
        "",
        "Want me to see if the same finishes fit your range?",
      ].join("\n"),
      customerDetails: ["Boulder showroom", "acoustic wall panels"],
      peerCaution: {
        prohibitedPeerNames: ["StoneWorks Supply"],
      },
    });

    const genericPeerResult = evaluateEmailQuality({
      subject: "Retail fit-out samples",
      body: [
        "Hi Maya,",
        "",
        "I noticed the Boulder showroom added acoustic wall panels last month.",
        "A similar distributor in your market used these panels to shorten retail fit-out lead times.",
        "",
        "Want me to see if the same finishes fit your range?",
      ].join("\n"),
      customerDetails: ["Boulder showroom", "acoustic wall panels"],
      peerCaution: {
        prohibitedPeerNames: ["StoneWorks Supply"],
      },
    });

    expectIssue(namedPeerResult, "peer-caution");
    expectNoIssue(genericPeerResult, "peer-caution");
  });
});
