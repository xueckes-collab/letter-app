export type EmailProviderSetup = {
  key: string;
  label: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    defaultUser?: string;
  };
  imap?: {
    host: string;
    port: number;
    secure: boolean;
  };
  authLabel: string;
  authHelp: string;
  setupUrl?: string;
  setupSteps: string[];
};

export type EmailAccountSetupResult = {
  provider: string;
  label: string;
  email: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  confidence: "known" | "guessed";
  manualConfigRequired: boolean;
  authLabel: string;
  authHelp: string;
  setupUrl?: string;
  setupSteps: string[];
};

export const EMAIL_PROVIDER_SETUPS: Record<string, EmailProviderSetup> = {
  snovio: {
    key: "snovio",
    label: "Snov.io",
    smtp: { host: "smtp.snov.io", port: 587, secure: false },
    imap: { host: "imap.snov.io", port: 993, secure: true },
    authLabel: "Snov.io 密码",
    authHelp: "使用 Snov.io 登录邮箱作为 SMTP 用户名，并填写 Snov.io 账号密码。",
    setupUrl: "https://app.snov.io/",
    setupSteps: [
      "使用 Snov.io 账号邮箱作为 SMTP 用户名。",
      "在密码框填写 Snov.io 账号密码。",
    ],
  },
  gmail: {
    key: "gmail",
    label: "Gmail",
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    authLabel: "Google 应用专用密码",
    authHelp: "Gmail 需要开启两步验证，并使用应用专用密码连接 SMTP。",
    setupUrl: "https://myaccount.google.com/apppasswords",
    setupSteps: [
      "打开 Google 账户安全设置。",
      "如果尚未开启，请先开启两步验证。",
      "为邮件应用创建应用专用密码。",
      "把 16 位应用专用密码粘贴到本软件。",
    ],
  },
  outlook: {
    key: "outlook",
    label: "Outlook / Hotmail",
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    authLabel: "Microsoft 密码或应用密码",
    authHelp: "如果 Microsoft 账户开启了两步验证，请使用应用密码。",
    setupUrl: "https://account.microsoft.com/security",
    setupSteps: [
      "打开 Microsoft 账户安全设置。",
      "如果开启了两步验证，请创建应用密码。",
      "把密码粘贴到本软件并验证 SMTP。",
    ],
  },
  qq: {
    key: "qq",
    label: "QQ Mail",
    smtp: { host: "smtp.qq.com", port: 465, secure: true },
    imap: { host: "imap.qq.com", port: 993, secure: true },
    authLabel: "QQ 邮箱授权码",
    authHelp: "QQ 邮箱需要先开启 SMTP 服务，并使用授权码连接。",
    setupUrl: "https://mail.qq.com",
    setupSteps: [
      "打开 QQ 邮箱设置。",
      "开启 POP3/SMTP 或 IMAP/SMTP 服务。",
      "生成授权码。",
      "把授权码粘贴到本软件。",
    ],
  },
  "163": {
    key: "163",
    label: "NetEase 163 / 126",
    smtp: { host: "smtp.163.com", port: 465, secure: true },
    imap: { host: "imap.163.com", port: 993, secure: true },
    authLabel: "网易邮箱授权码",
    authHelp: "网易邮箱通常需要开启 SMTP 服务，并使用授权码连接。",
    setupUrl: "https://mail.163.com",
    setupSteps: [
      "打开网易邮箱设置。",
      "开启 POP3/SMTP/IMAP 服务。",
      "生成授权码。",
      "把授权码粘贴到本软件。",
    ],
  },
  yahoo: {
    key: "yahoo",
    label: "Yahoo Mail",
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    authLabel: "Yahoo 应用密码",
    authHelp: "Yahoo 邮箱需要为第三方邮件客户端生成应用密码。",
    setupUrl: "https://login.yahoo.com/account/security",
    setupSteps: [
      "打开 Yahoo 账户安全设置。",
      "创建应用密码。",
      "把应用密码粘贴到本软件。",
    ],
  },
  zoho: {
    key: "zoho",
    label: "Zoho Mail",
    smtp: { host: "smtp.zoho.com", port: 465, secure: true },
    imap: { host: "imap.zoho.com", port: 993, secure: true },
    authLabel: "Zoho 应用密码",
    authHelp: "如果 Zoho 开启了多因素认证，请使用 Zoho 应用密码。",
    setupUrl: "https://accounts.zoho.com/home#security/security_pwd",
    setupSteps: [
      "打开 Zoho 账户安全设置。",
      "为邮件生成应用密码。",
      "把应用密码粘贴到本软件。",
    ],
  },
  icloud: {
    key: "icloud",
    label: "iCloud Mail",
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    authLabel: "iCloud 应用专用密码",
    authHelp: "iCloud 邮箱需要使用 Apple ID 生成的应用专用密码。",
    setupUrl: "https://appleid.apple.com/account/manage",
    setupSteps: [
      "打开 Apple ID 账户管理页面。",
      "创建应用专用密码。",
      "把密码粘贴到本软件。",
    ],
  },
  fastmail: {
    key: "fastmail",
    label: "Fastmail",
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
    authLabel: "Fastmail 应用密码",
    authHelp: "Fastmail 建议为邮件客户端创建应用密码。",
    setupUrl: "https://app.fastmail.com/settings/security",
    setupSteps: [
      "打开 Fastmail 安全设置。",
      "创建具备邮件权限的应用密码。",
      "把应用密码粘贴到本软件。",
    ],
  },
  sendgrid: {
    key: "sendgrid",
    label: "SendGrid",
    smtp: { host: "smtp.sendgrid.net", port: 465, secure: true, defaultUser: "apikey" },
    authLabel: "SendGrid API Key",
    authHelp: "SMTP 用户名使用 apikey，并把 SendGrid API Key 填入密码框。",
    setupUrl: "https://app.sendgrid.com/settings/api_keys",
    setupSteps: [
      "创建或打开 SendGrid API Key。",
      "保持 SMTP 用户名为 apikey。",
      "把 API Key 粘贴到密码框。",
    ],
  },
  mailgun: {
    key: "mailgun",
    label: "Mailgun",
    smtp: { host: "smtp.mailgun.org", port: 465, secure: true },
    authLabel: "Mailgun SMTP 密码",
    authHelp: "使用 Mailgun 发信域名页面提供的 SMTP 凭证。",
    setupUrl: "https://app.mailgun.com/",
    setupSteps: [
      "打开 Mailgun 发信域名。",
      "复制 SMTP 登录名和密码。",
      "把 SMTP 密码粘贴到本软件。",
    ],
  },
};

export const SMTP_PRESETS = Object.fromEntries(
  Object.entries(EMAIL_PROVIDER_SETUPS).map(([key, setup]) => [key, setup.smtp]),
) as Record<string, { host: string; port: number; secure: boolean; defaultUser?: string }>;

export const IMAP_PRESETS = Object.fromEntries(
  Object.entries(EMAIL_PROVIDER_SETUPS)
    .filter(([, setup]) => Boolean(setup.imap))
    .map(([key, setup]) => [key, setup.imap!]),
) as Record<string, { host: string; port: number; secure: boolean }>;

export const EMAIL_DOMAIN_MAP: Record<string, string> = {
  "gmail.com": "gmail",
  "googlemail.com": "gmail",
  "outlook.com": "outlook",
  "hotmail.com": "outlook",
  "live.com": "outlook",
  "msn.com": "outlook",
  "office365.com": "outlook",
  "qq.com": "qq",
  "foxmail.com": "qq",
  "163.com": "163",
  "126.com": "163",
  "yeah.net": "163",
  "yahoo.com": "yahoo",
  "yahoo.co.jp": "yahoo",
  "yahoo.co.uk": "yahoo",
  "zoho.com": "zoho",
  "snov.io": "snovio",
  "icloud.com": "icloud",
  "me.com": "icloud",
  "mac.com": "icloud",
  "fastmail.com": "fastmail",
};

function getDomain(email: string): string | null {
  const domain = email.trim().split("@")[1]?.toLowerCase();
  return domain || null;
}

export function detectEmailProvider(email: string): string | null {
  const domain = getDomain(email);
  if (!domain) return null;
  return EMAIL_DOMAIN_MAP[domain] ?? null;
}

export function buildEmailAccountSetup(input: {
  email: string;
  provider?: string | null;
}): EmailAccountSetupResult {
  const email = input.email.trim();
  const domain = getDomain(email);
  const requestedProvider = input.provider && input.provider !== "auto" ? input.provider : null;
  const providerKey = requestedProvider || detectEmailProvider(email);
  const knownSetup = providerKey ? EMAIL_PROVIDER_SETUPS[providerKey] : null;

  if (knownSetup) {
    return {
      provider: knownSetup.key,
      label: knownSetup.label,
      email,
      smtpHost: knownSetup.smtp.host,
      smtpPort: knownSetup.smtp.port,
      smtpSecure: knownSetup.smtp.secure,
      smtpUser: knownSetup.smtp.defaultUser || email,
      imapHost: knownSetup.imap?.host ?? null,
      imapPort: knownSetup.imap?.port ?? null,
      imapSecure: knownSetup.imap?.secure ?? true,
      confidence: "known",
      manualConfigRequired: false,
      authLabel: knownSetup.authLabel,
      authHelp: knownSetup.authHelp,
      setupUrl: knownSetup.setupUrl,
      setupSteps: knownSetup.setupSteps,
    };
  }

  const guessedDomain = domain || "example.com";

  return {
    provider: "custom",
    label: domain ? `${domain} SMTP` : "自定义 SMTP",
    email,
    smtpHost: `smtp.${guessedDomain}`,
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: email,
    imapHost: `imap.${guessedDomain}`,
    imapPort: 993,
    imapSecure: true,
    confidence: "guessed",
    manualConfigRequired: true,
    authLabel: "SMTP 密码或应用密码",
    authHelp: "该域名不在内置服务商列表中，系统已按常见规则填写主机名；如验证失败，请按邮箱服务商说明调整。",
    setupSteps: [
      "向邮箱管理员确认 SMTP 和 IMAP 主机名。",
      "如果服务商提供应用密码或授权码，请优先使用。",
      "保存前先运行 SMTP 验证。",
    ],
  };
}
