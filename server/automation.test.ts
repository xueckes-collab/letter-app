import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: 'user' | 'admin' = 'user'): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("automation.getSettings", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.automation.getSettings()).rejects.toThrow();
  });

  it("returns default settings for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.automation.getSettings();
    expect(result).toBeDefined();
    expect(result.followUpHours).toBeDefined();
    expect(typeof result.followUpHours).toBe("number");
    expect(result.autoFollowUpEnabled).toBeDefined();
    expect(result.notifyOnReply).toBeDefined();
  });
});

describe("automation.updateSettings", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.automation.updateSettings({ followUpHours: 72 })
    ).rejects.toThrow();
  });

  it("validates followUpHours range", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Too low
    await expect(
      caller.automation.updateSettings({ followUpHours: 0 })
    ).rejects.toThrow();
    // Too high
    await expect(
      caller.automation.updateSettings({ followUpHours: 1000 })
    ).rejects.toThrow();
  });

  it("validates maxFollowUpRounds range", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.automation.updateSettings({ maxFollowUpRounds: 0 })
    ).rejects.toThrow();
    await expect(
      caller.automation.updateSettings({ maxFollowUpRounds: 25 })
    ).rejects.toThrow();
  });

  it("validates sendDelaySeconds range", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.automation.updateSettings({ sendDelaySeconds: 0 })
    ).rejects.toThrow();
    await expect(
      caller.automation.updateSettings({ sendDelaySeconds: 100 })
    ).rejects.toThrow();
  });
});
