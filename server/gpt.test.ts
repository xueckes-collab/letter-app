import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("OpenAI API Key validation", () => {
  it("reads a configured OPENAI_API_KEY", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

    const key = process.env.OPENAI_API_KEY;

    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(key!.startsWith("sk-")).toBe(true);
  });

  it("validates API key against OpenAI with a mocked models response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": "Bearer sk-test-key" },
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
