import { describe, expect, it } from "vitest";

describe("OpenAI API Key validation", () => {
  it("should have OPENAI_API_KEY configured", () => {
    const key = process.env.OPENAI_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(key!.startsWith("sk-")).toBe(true);
  });

  it("should validate API key against OpenAI", async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      console.warn("Skipping: no API key");
      return;
    }

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": `Bearer ${key}` },
    });

    expect(response.ok).toBe(true);
  }, 15000);
});
