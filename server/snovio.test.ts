import { describe, expect, it } from "vitest";

describe("Snov.io API Credentials", () => {
  it("should have SNOVIO_CLIENT_ID configured", () => {
    expect(process.env.SNOVIO_CLIENT_ID).toBeTruthy();
  });

  it("should have SNOVIO_CLIENT_SECRET configured", () => {
    expect(process.env.SNOVIO_CLIENT_SECRET).toBeTruthy();
  });

  it("should validate credentials against Snov.io API", async () => {
    const { validateSnovioCredentials } = await import("./services/snovio");
    const result = await validateSnovioCredentials();
    expect(result.valid).toBe(true);
  }, 15000);
});
