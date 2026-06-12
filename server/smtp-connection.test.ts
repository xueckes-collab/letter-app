import { describe, expect, it } from "vitest";
import {
  buildSmtpConnectionAttempts,
  getSmtpErrorHint,
  getSmtpFailureSummary,
  normalizeSmtpConnectionConfig,
} from "./services/email-sender";

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

  it("normalizes common port and encryption mismatches", () => {
    expect(normalizeSmtpConnectionConfig({
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: false,
      smtpUser: "sender@gmail.com",
      smtpPass: "secret",
    })).toMatchObject({
      smtpPort: 465,
      smtpSecure: true,
    });

    expect(normalizeSmtpConnectionConfig({
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: true,
      smtpUser: "sender@gmail.com",
      smtpPass: "secret",
    })).toMatchObject({
      smtpPort: 587,
      smtpSecure: false,
    });
  });

  it("summarizes refused local proxy errors for users", () => {
    const summary = getSmtpFailureSummary(
      new Error("connect ECONNREFUSED 127.0.0.1:7891"),
      [
        { host: "smtp.gmail.com", port: 587, secure: false, proxyUrl: null, success: false, error: "Unexpected socket close" },
        { host: "smtp.gmail.com", port: 465, secure: true, proxyUrl: "http://127.0.0.1:7891", success: false, error: "connect ECONNREFUSED 127.0.0.1:7891" },
      ],
    );

    expect(summary.hint).toContain("当前网络或本机代理");
    expect(summary.error).toContain("本机代理端口不可用");
    expect(summary.error).not.toContain("127.0.0.1:7891");
  });

  it("explains TLS handshake failures", () => {
    const hint = getSmtpErrorHint(new Error("Client network socket disconnected before secure TLS connection was established"));

    expect(hint).toContain("TLS");
    expect(hint).toContain("587");
  });
});
