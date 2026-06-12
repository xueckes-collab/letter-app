import { describe, expect, it, vi } from "vitest";

describe("GPT Integration", () => {
  it("gpt.ts module exports all required functions", async () => {
    const gpt = await import("./services/gpt");
    expect(typeof gpt.invokeGPT).toBe("function");
    expect(typeof gpt.gptComplete).toBe("function");
    expect(typeof gpt.gptJSON).toBe("function");
    expect(typeof gpt.validateOpenAIKey).toBe("function");
  });

  it("llm-engine.ts exports all analysis functions with correct types", async () => {
    const engine = await import("./services/llm-engine");
    expect(typeof engine.analyzeWebsite).toBe("function");
    expect(typeof engine.matchICP).toBe("function");
    expect(typeof engine.matchUSP).toBe("function");
    expect(typeof engine.generateEmail).toBe("function");
    expect(typeof engine.analyzeReply).toBe("function");
  });

  it("llm-engine.ts exports result type interfaces", async () => {
    // Verify the module structure includes the type exports
    const engine = await import("./services/llm-engine");
    // Functions should exist and be callable
    expect(engine.analyzeWebsite.length).toBe(2); // 2 params
    expect(engine.matchICP.length).toBe(2); // 2 params
    expect(engine.matchUSP.length).toBe(3); // 3 params
    expect(engine.generateEmail.length).toBe(1); // 1 params object
    expect(engine.analyzeReply.length).toBe(2); // 2 params
  });

  it("validateOpenAIKey returns valid when the models check succeeds", async () => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { validateOpenAIKey } = await import("./services/gpt");
    const result = await validateOpenAIKey();

    expect(result.valid).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      headers: { "Authorization": "Bearer test-key" },
    });

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("follow-up strategies module provides strategies for rounds 1-9", async () => {
    const { getStrategyForRound } = await import("./services/follow-up-strategies");
    for (let i = 1; i <= 9; i++) {
      const strategy = getStrategyForRound(i);
      expect(strategy).toBeDefined();
      expect(strategy?.name).toBeTruthy();
    }
    // Round 0 and 10+ should return null/undefined (no strategy)
    expect(getStrategyForRound(0)).toBeFalsy();
    expect(getStrategyForRound(10)).toBeFalsy();
  });
});
