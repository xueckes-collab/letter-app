import { describe, expect, it } from "vitest";
import { buildSmtpConnectionAttempts, getSmtpErrorHint } from "./services/email-sender";

describe("smtp connection helpers", () => {
  it("tries 587 STARTTLS after 465 SSL", () => {
    const attempts = buildSmtpConnectionAttempts({
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: "sender@gmail.com",
      smtpPass: "secret",
    });

    expect(attempts.slice(0, 2).map(item => ({ port: item.smtpPort, secure: item.smtpSecure, proxy: item.smtpProxyUrl }))).toEqual([
      { port: 465, secure: true, proxy: null },
      { port: 587, secure: false, proxy: null },
    ]);
    expect(attempts).toContainEqual(expect.objectContaining({
      smtpPort: 587,
      smtpSecure: false,
      smtpProxyUrl: "http://127.0.0.1:2340",
    }));
  });

  it("tries configured proxy candidates after direct attempts", () => {
    const attempts = buildSmtpConnectionAttempts({
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: "sender@gmail.com",
      smtpPass: "secret",
      smtpProxyUrl: "http://127.0.0.1:2340",
    });

    expect(attempts.map(item => ({ port: item.smtpPort, secure: item.smtpSecure, proxy: item.smtpProxyUrl })).slice(0, 4)).toEqual([
      { port: 465, secure: true, proxy: null },
      { port: 587, secure: false, proxy: null },
      { port: 465, secure: true, proxy: "http://127.0.0.1:2340" },
      { port: 587, secure: false, proxy: "http://127.0.0.1:2340" },
    ]);
  });

  it("tries 465 SSL after 587 STARTTLS", () => {
    const attempts = buildSmtpConnectionAttempts({
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "sender@gmail.com",
      smtpPass: "secret",
    });

    expect(attempts.slice(0, 2).map(item => ({ port: item.smtpPort, secure: item.smtpSecure, proxy: item.smtpProxyUrl }))).toEqual([
      { port: 587, secure: false, proxy: null },
      { port: 465, secure: true, proxy: null },
    ]);
  });

  it("explains TLS handshake failures", () => {
    const hint = getSmtpErrorHint(new Error("Client network socket disconnected before secure TLS connection was established"));

    expect(hint).toContain("TLS");
    expect(hint).toContain("587");
  });
});
