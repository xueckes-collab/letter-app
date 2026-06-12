import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Snov.io API Credentials", () => {
  it("reads a configured SNOVIO_CLIENT_ID", () => {
    vi.stubEnv("SNOVIO_CLIENT_ID", "test-client-id");

    expect(process.env.SNOVIO_CLIENT_ID).toBeTruthy();
  });

  it("reads a configured SNOVIO_CLIENT_SECRET", () => {
    vi.stubEnv("SNOVIO_CLIENT_SECRET", "test-client-secret");

    expect(process.env.SNOVIO_CLIENT_SECRET).toBeTruthy();
  });

  it("validates credentials against Snov.io with a mocked token response", async () => {
    vi.stubEnv("SNOVIO_CLIENT_ID", "test-client-id");
    vi.stubEnv("SNOVIO_CLIENT_SECRET", "test-client-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "mock-token", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { validateSnovioCredentials } = await import("./services/snovio");
    const result = await validateSnovioCredentials();

    expect(result.valid).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.snov.io/v1/oauth/access_token", expect.objectContaining({
      method: "POST",
    }));
  });
});
