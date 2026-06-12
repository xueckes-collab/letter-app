import { describe, expect, it } from "vitest";
import {
  buildHookEvidencePromptClause,
  buildWebsiteEvidenceInput,
  collectHookEvidenceForPrompt,
} from "./services/llm-engine";

describe("LLM evidence backtrace", () => {
  it("builds structured evidence from formatted scrape output", () => {
    const input = `=== Website Analysis: https://buyer.example ===

--- Homepage Metadata ---
Title: Buyer Example Flooring Distributor
Description: Distributor of commercial flooring products for hotel and retail projects.
Key Headings: Commercial Flooring | Hotel Renovation Projects

--- Source Evidence For Non-Mass-Mail Hooks ---
- [purchase_signal] The team asks suppliers for FloorScore certificates and low-VOC documentation. (source: https://buyer.example/certifications)

--- PRODUCTS Page (https://buyer.example/products) ---
Title: Commercial flooring collections
Our new hotel renovation collection includes in-stock SPC flooring, stair nosing, and matching trims for project contractors.

--- CERTIFICATIONS Page (https://buyer.example/sustainability) ---
We highlight FloorScore certified materials and low-VOC options for retail and hospitality projects.`;

    const evidenceInput = buildWebsiteEvidenceInput(input);

    expect(evidenceInput.sourceUrls).toContain("https://buyer.example");
    expect(evidenceInput.sourceUrls).toContain("https://buyer.example/products");
    expect(evidenceInput.evidence.some(item => item.sourceUrl === "https://buyer.example/products")).toBe(true);
    expect(evidenceInput.evidence.some(item => item.sourceUrl === "https://buyer.example/certifications" && item.text.includes("FloorScore"))).toBe(true);
    expect(evidenceInput.evidence.some(item => item.text.includes("hotel renovation collection"))).toBe(true);
    expect(evidenceInput.modelInput).toContain("STRUCTURED_EVIDENCE_JSON");
  });

  it("collects hook evidence from website analysis for email prompts", () => {
    const hookEvidence = collectHookEvidenceForPrompt({
      hookEvidence: [
        {
          hook: "Buyer promotes hotel renovation flooring",
          sourceUrl: "https://buyer.example/products",
          evidenceText: "Hotel renovation collection includes in-stock SPC flooring.",
        },
      ],
      hookOpportunities: [
        "They mention low-VOC hospitality projects [source: https://buyer.example/sustainability]",
      ],
      evidence: [
        {
          sourceUrl: "https://buyer.example/products",
          pageType: "products",
          text: "Hotel renovation collection includes in-stock SPC flooring.",
        },
      ],
    });

    expect(hookEvidence[0]).toEqual({
      hook: "Buyer promotes hotel renovation flooring",
      sourceUrl: "https://buyer.example/products",
      evidenceText: "Hotel renovation collection includes in-stock SPC flooring.",
    });
    expect(hookEvidence.some(item => item.sourceUrl === "https://buyer.example/sustainability")).toBe(true);
  });

  it("requires source-backed hooks in the email prompt clause", () => {
    const withEvidence = buildHookEvidencePromptClause([
      {
        hook: "Buyer promotes hotel renovation flooring",
        sourceUrl: "https://buyer.example/products",
        evidenceText: "Hotel renovation collection includes in-stock SPC flooring.",
      },
    ]);
    const withoutEvidence = buildHookEvidencePromptClause([]);

    expect(withEvidence).toContain("hookEvidenceForEmail");
    expect(withEvidence).toContain("sourceUrl");
    expect(withEvidence).toContain("strategyNotes");
    expect(withoutEvidence).toContain("不要编造");
    expect(withoutEvidence).toContain("缺少可验证网站证据");
  });
});
