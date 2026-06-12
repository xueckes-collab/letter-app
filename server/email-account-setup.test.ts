import { describe, expect, it } from "vitest";
import { buildEmailAccountSetup, detectEmailProvider } from "./services/email-account-setup";

describe("email account SMTP setup", () => {
  it("detects common providers from email domains", () => {
    expect(detectEmailProvider("sender@gmail.com")).toBe("gmail");
    expect(detectEmailProvider("sender@hotmail.com")).toBe("outlook");
    expect(detectEmailProvider("sender@qq.com")).toBe("qq");
    expect(detectEmailProvider("sender@icloud.com")).toBe("icloud");
  });

  it("builds a complete Gmail SMTP and IMAP setup", () => {
    const setup = buildEmailAccountSetup({ email: "sender@gmail.com" });

    expect(setup.provider).toBe("gmail");
    expect(setup.smtpHost).toBe("smtp.gmail.com");
    expect(setup.smtpPort).toBe(465);
    expect(setup.smtpSecure).toBe(true);
    expect(setup.smtpUser).toBe("sender@gmail.com");
    expect(setup.imapHost).toBe("imap.gmail.com");
    expect(setup.manualConfigRequired).toBe(false);
  });

  it("uses SendGrid's required SMTP username", () => {
    const setup = buildEmailAccountSetup({
      email: "verified@example.com",
      provider: "sendgrid",
    });

    expect(setup.provider).toBe("sendgrid");
    expect(setup.smtpHost).toBe("smtp.sendgrid.net");
    expect(setup.smtpUser).toBe("apikey");
    expect(setup.authLabel).toContain("API Key");
  });

  it("guesses editable SMTP and IMAP hosts for custom domains", () => {
    const setup = buildEmailAccountSetup({ email: "sales@example-manufacturer.com" });

    expect(setup.provider).toBe("custom");
    expect(setup.confidence).toBe("guessed");
    expect(setup.manualConfigRequired).toBe(true);
    expect(setup.smtpHost).toBe("smtp.example-manufacturer.com");
    expect(setup.imapHost).toBe("imap.example-manufacturer.com");
  });
});
