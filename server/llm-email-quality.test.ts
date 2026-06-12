import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_COLD_EMAIL_PHRASES,
  reviewGeneratedEmailDraft,
} from "./services/llm-engine";

describe("cold email quality gate", () => {
  it("rejects generic translated cold email templates", () => {
    const review = reviewGeneratedEmailDraft({
      subject: "High quality flooring supplier for you",
      body: `Dear Sir/Madam,

I hope this email finds you well. We are a leading manufacturer of high quality and competitive price flooring products.

If you are interested, please feel free to contact us. Looking forward to your reply.`,
      strategyNotes: "",
    });

    expect(review.passed).toBe(false);
    expect(review.blockers.join(" ")).toContain("模板化禁用表达");
    expect(review.blockers.join(" ")).toContain("低门槛");
  });

  it("rejects self-introduction as the first substantive sentence", () => {
    const review = reviewGeneratedEmailDraft({
      subject: "Flooring samples for projects",
      body: `Hi Mark,

We make SPC flooring for importers in Europe.

I noticed your team added hotel renovation projects to the site last month. Our 5.5mm click SPC can ship sample boards in 3 days.

Want me to send two finishes for your project team to compare?`,
      strategyNotes: "",
    });

    expect(review.passed).toBe(false);
    expect(review.blockers.join(" ")).toContain("第一句");
  });

  it("accepts a short buyer-led email with a low-friction CTA", () => {
    const review = reviewGeneratedEmailDraft({
      subject: "SPC samples for hotel projects",
      body: `Hi Mark,

I noticed your new hotel renovation page lists fast-turn flooring as a project bottleneck.

For similar contractors, we usually prepare SPC sample boards in 3 days and keep matching trims in the same batch, so approvals do not stall on small accessories.

Worth sending two finishes your project team can compare this week?`,
      strategyNotes: "",
    });

    expect(review.passed).toBe(true);
    expect(review.blockers).toEqual([]);
  });

  it("keeps the forbidden phrase list explicit", () => {
    expect(FORBIDDEN_COLD_EMAIL_PHRASES).toContain("i hope this email finds you well");
    expect(FORBIDDEN_COLD_EMAIL_PHRASES).toContain("we are a leading");
    expect(FORBIDDEN_COLD_EMAIL_PHRASES).toContain("looking forward to your reply");
  });
});
