import { describe, expect, it, vi } from "vitest";
import { getSchedulerHealth } from "./services/scheduler";
import { SMTP_PRESETS, verifySMTP } from "./services/email-sender";

describe("Scheduler Health", () => {
  it("should return health status with expected fields", () => {
    const health = getSchedulerHealth();
    expect(health).toHaveProperty("healthy");
    expect(health).toHaveProperty("followUpErrors");
    expect(health).toHaveProperty("replyErrors");
    expect(health).toHaveProperty("lastFollowUpCheck");
    expect(health).toHaveProperty("lastReplyCheck");
    expect(typeof health.healthy).toBe("boolean");
    expect(typeof health.followUpErrors).toBe("number");
    expect(typeof health.replyErrors).toBe("number");
  });

  it("should start as healthy with zero errors", () => {
    const health = getSchedulerHealth();
    expect(health.healthy).toBe(true);
    expect(health.followUpErrors).toBe(0);
    expect(health.replyErrors).toBe(0);
  });
});

describe("SMTP Presets", () => {
  it("should have Snov.io preset with correct SMTP settings", () => {
    expect(SMTP_PRESETS).toHaveProperty("snovio");
    const snovio = SMTP_PRESETS["snovio"];
    expect(snovio.host).toBe("smtp.snov.io");
    expect(snovio.port).toBe(587);
    expect(snovio.secure).toBe(false);
  });

  it("should have Gmail preset with correct SMTP settings", () => {
    expect(SMTP_PRESETS).toHaveProperty("gmail");
    const gmail = SMTP_PRESETS["gmail"];
    expect(gmail.host).toBe("smtp.gmail.com");
    expect(gmail.port).toBe(465);
    expect(gmail.secure).toBe(true);
  });

  it("should have Outlook preset with correct SMTP settings", () => {
    expect(SMTP_PRESETS).toHaveProperty("outlook");
    const outlook = SMTP_PRESETS["outlook"];
    expect(outlook.host).toBe("smtp.office365.com");
    expect(outlook.port).toBe(587);
    expect(outlook.secure).toBe(false);
  });

  it("should have QQ Mail preset", () => {
    expect(SMTP_PRESETS).toHaveProperty("qq");
    expect(SMTP_PRESETS["qq"].host).toBe("smtp.qq.com");
  });

  it("should have 163 Mail preset", () => {
    expect(SMTP_PRESETS).toHaveProperty("163");
    expect(SMTP_PRESETS["163"].host).toBe("smtp.163.com");
  });

  it("should have Yahoo preset", () => {
    expect(SMTP_PRESETS).toHaveProperty("yahoo");
    expect(SMTP_PRESETS["yahoo"].host).toBe("smtp.mail.yahoo.com");
  });

  it("all presets should have required fields", () => {
    for (const [key, preset] of Object.entries(SMTP_PRESETS)) {
      expect(preset).toHaveProperty("host");
      expect(preset).toHaveProperty("port");
      expect(preset).toHaveProperty("secure");
      expect(typeof preset.host).toBe("string");
      expect(typeof preset.port).toBe("number");
      expect(typeof preset.secure).toBe("boolean");
    }
  });
});

describe("SMTP Verification", () => {
  it("should reject invalid SMTP credentials gracefully", async () => {
    const result = await verifySMTP({
      smtpHost: "smtp.invalid-host-that-does-not-exist.com",
      smtpPort: 587,
      smtpUser: "fake@test.com",
      smtpPass: "fakepass",
      smtpSecure: false,
    });
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
  }, 15000);
});
