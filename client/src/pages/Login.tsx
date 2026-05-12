import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { GOOGLE_CLIENT_ID } from "@/const";

// ============================================================
// Constants & Presets
// ============================================================
const SMTP_PRESETS: Record<string, { provider: string; label: string; host: string; port: number; secure: boolean; imapHost: string; imapPort: number; imapSecure: boolean }> = {
  gmail: { provider: "gmail", label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true, imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true },
  outlook: { provider: "outlook", label: "Outlook", host: "smtp.office365.com", port: 587, secure: false, imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true },
  qq: { provider: "qq", label: "QQ邮箱", host: "smtp.qq.com", port: 465, secure: true, imapHost: "imap.qq.com", imapPort: 993, imapSecure: true },
  "163": { provider: "163", label: "网易 163", host: "smtp.163.com", port: 465, secure: true, imapHost: "imap.163.com", imapPort: 993, imapSecure: true },
  yahoo: { provider: "yahoo", label: "Yahoo", host: "smtp.mail.yahoo.com", port: 465, secure: true, imapHost: "imap.mail.yahoo.com", imapPort: 993, imapSecure: true },
  zoho: { provider: "zoho", label: "Zoho", host: "smtp.zoho.com", port: 465, secure: true, imapHost: "imap.zoho.com", imapPort: 993, imapSecure: true },
};

const REG_DOMAIN_MAP: Record<string, string> = {
  "gmail.com": "gmail", "googlemail.com": "gmail",
  "outlook.com": "outlook", "hotmail.com": "outlook", "live.com": "outlook", "msn.com": "outlook",
  "qq.com": "qq", "foxmail.com": "qq",
  "163.com": "163", "126.com": "163", "yeah.net": "163",
  "yahoo.com": "yahoo", "yahoo.co.jp": "yahoo", "yahoo.co.uk": "yahoo",
  "zoho.com": "zoho",
};

// ============================================================
// Frontend validation helpers (mirror backend rules)
// ============================================================
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmailFrontend(email: string): string | null {
  if (!email.trim()) return "请输入邮箱地址";
  if (!EMAIL_REGEX.test(email)) return "邮箱格式不正确";
  if (email.length > 320) return "邮箱地址过长";
  return null;
}

function getPasswordStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string; color: string; bgColor: string } {
  if (!pw || pw.length < 8) return { level: 0, label: "太短", color: "text-muted-foreground", bgColor: "bg-muted" };
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { level: 1, label: "弱", color: "text-red-500", bgColor: "bg-red-500" };
  if (score <= 3) return { level: 2, label: "中等", color: "text-amber-500", bgColor: "bg-amber-500" };
  return { level: 3, label: "强", color: "text-emerald-500", bgColor: "bg-emerald-500" };
}

function validatePasswordFrontend(pw: string): string | null {
  if (pw.length < 8) return "密码长度至少 8 位";
  if (pw.length > 128) return "密码长度不能超过 128 位";
  return null;
}

// ============================================================
// Decorative SVG Icons for Features
// ============================================================
function MailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// ============================================================
// Main Component
// ============================================================
export default function LoginPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [smtpPass, setSmtpPass] = useState("");

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const utils = trpc.useUtils();
  const { data: googleEnabled } = trpc.auth.googleEnabled.useQuery();

  // Google Identity Services
  useEffect(() => {
    if (!googleEnabled?.enabled || !GOOGLE_CLIENT_ID || typeof window === "undefined") return;

    const existingScript = document.getElementById("google-identity-script") as HTMLScriptElement | null;

    const initialize = () => {
      const google = (window as any).google;
      const slot = document.getElementById("google-signin-slot");
      if (!google?.accounts?.id || !slot) return;
      slot.innerHTML = "";
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: any) => {
          if (response?.credential) handleGoogleLogin(response.credential);
        },
      });
      google.accounts.id.renderButton(slot, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "signin_with",
        shape: "pill",
      });
    };

    if (existingScript) {
      if ((window as any).google?.accounts?.id) initialize();
      return;
    }

    const script = document.createElement("script");
    script.id = "google-identity-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initialize;
    document.head.appendChild(script);
  }, [googleEnabled?.enabled]);

  const getNextPath = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "/";
  };

  // ---- Handlers ----
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); return; }
      await utils.auth.me.invalidate();
      navigate(getNextPath());
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    const trimmedName = registerName.trim();
    if (!trimmedName) errors.name = "请输入用户名";
    const emailErr = validateEmailFrontend(registerEmail);
    if (emailErr) errors.email = emailErr;
    const pwErr = validatePasswordFrontend(registerPassword);
    if (pwErr) errors.password = pwErr;
    if (registerPassword !== confirmPassword) errors.confirmPassword = "两次输入的密码不一致";

    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: registerEmail, password: registerPassword, name: trimmedName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); return; }

      if (smtpPass) {
        try {
          const domain = registerEmail.split("@")[1]?.toLowerCase();
          const providerKey = domain ? REG_DOMAIN_MAP[domain] : undefined;
          const preset = providerKey ? SMTP_PRESETS[providerKey] : undefined;
          if (preset) {
            await fetch("/api/trpc/emailAccounts.create?batch=1", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ "0": { json: {
                provider: preset.provider, label: preset.label, email: registerEmail,
                smtpHost: preset.host, smtpPort: preset.port, smtpUser: registerEmail,
                smtpPass: smtpPass, smtpSecure: preset.secure,
                imapHost: preset.imapHost, imapPort: preset.imapPort, imapSecure: preset.imapSecure,
                isDefault: true,
              }}}),
            });
          }
        } catch (e) {
          console.error("Auto email setup failed:", e);
        }
      }

      await utils.auth.me.invalidate();
      navigate(getNextPath());
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (credential: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Google login failed"); return; }
      await utils.auth.me.invalidate();
      navigate(getNextPath());
    } catch {
      setError("Google login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = getPasswordStrength(registerPassword);

  // ============================================================
  // Render
  // ============================================================
  return (
    <>
      {/* Custom animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(3deg); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-12px) rotate(-2deg); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.3; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-slow { animation: float-slow 8s ease-in-out infinite; }
        .animate-fade-in-up { animation: fade-in-up 0.5s ease-out forwards; }
        .animate-pulse-ring { animation: pulse-ring 4s ease-in-out infinite; }
        .stagger-1 { animation-delay: 0.1s; }
        .stagger-2 { animation-delay: 0.2s; }
        .stagger-3 { animation-delay: 0.3s; }
        .stagger-4 { animation-delay: 0.4s; }
        .stagger-5 { animation-delay: 0.5s; }
      `}</style>

      <div className="min-h-screen flex bg-background">
        {/* ============================================================ */}
        {/* Left Panel — Brand Showcase                                 */}
        {/* ============================================================ */}
        <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          {/* Decorative background elements */}
          <div className="absolute inset-0">
            {/* Large gradient orb */}
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/10 blur-3xl animate-pulse-ring" />
            <div className="absolute top-1/3 -right-20 w-72 h-72 rounded-full bg-gradient-to-br from-blue-500/10 to-violet-500/10 blur-3xl animate-pulse-ring" style={{ animationDelay: "2s" }} />
            <div className="absolute -bottom-20 left-1/4 w-80 h-80 rounded-full bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 blur-3xl animate-pulse-ring" style={{ animationDelay: "4s" }} />

            {/* Grid pattern overlay */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }} />

            {/* Floating geometric shapes */}
            <div className="absolute top-20 right-20 w-16 h-16 border border-white/10 rounded-xl rotate-12 animate-float" />
            <div className="absolute bottom-32 left-16 w-10 h-10 border border-orange-500/20 rounded-lg rotate-45 animate-float-slow" />
            <div className="absolute top-1/2 right-1/3 w-6 h-6 bg-orange-500/10 rounded-full animate-float" style={{ animationDelay: "1s" }} />
            <div className="absolute top-[15%] left-[40%] w-3 h-3 bg-white/10 rounded-full animate-float-slow" style={{ animationDelay: "3s" }} />
            <div className="absolute bottom-[25%] right-[15%] w-8 h-8 border border-white/5 rounded-full animate-float" style={{ animationDelay: "2s" }} />
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16 py-12 w-full">
            {/* Logo / Brand */}
            <div className="animate-fade-in-up opacity-0 stagger-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" />
                    <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
                  </svg>
                </div>
                <span className="text-white/90 text-xl font-semibold tracking-tight">Letter</span>
              </div>
            </div>

            {/* Headline */}
            <div className="mt-12 animate-fade-in-up opacity-0 stagger-2">
              <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight">
                智能外发邮件
                <br />
                <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-300 bg-clip-text text-transparent">
                  自动化跟进
                </span>
              </h1>
              <p className="text-slate-400 mt-4 text-lg leading-relaxed max-w-md">
                AI 驱动的邮件外发平台，帮助你高效触达目标客户，智能管理跟进流程。
              </p>
            </div>

            {/* Feature list */}
            <div className="mt-12 space-y-5 animate-fade-in-up opacity-0 stagger-3">
              {[
                { icon: <MailIcon />, title: "智能邮件编写", desc: "AI 辅助生成个性化邮件，提升打开率" },
                { icon: <ZapIcon />, title: "自动化跟进", desc: "设定规则后自动发送跟进邮件，不遗漏任何线索" },
                { icon: <ShieldIcon />, title: "安全可靠", desc: "端到端加密，多邮箱管理，企业级安全保障" },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 group"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-orange-400 transition-all duration-300 group-hover:bg-orange-500/10 group-hover:border-orange-500/20 group-hover:scale-105">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-white/90 font-medium text-sm">{feature.title}</h3>
                    <p className="text-slate-500 text-sm mt-0.5">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom stats */}
            <div className="mt-auto pt-12 animate-fade-in-up opacity-0 stagger-4">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>系统运行正常</span>
                </div>
                <div className="text-slate-600">|</div>
                <div className="text-slate-500">v2.0</div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Right Panel — Form Area                                     */}
        {/* ============================================================ */}
        <div className="w-full lg:w-[48%] flex items-center justify-center p-6 sm:p-8 lg:p-12 relative">
          {/* Subtle background decoration for right panel */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-50 to-transparent rounded-full blur-3xl opacity-60 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-slate-50 to-transparent rounded-full blur-3xl opacity-60 pointer-events-none" />

          <div className="relative z-10 w-full max-w-[420px]">
            {/* Mobile brand header */}
            <div className="lg:hidden text-center mb-8 animate-fade-in-up opacity-0 stagger-1">
              <div className="flex items-center justify-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" />
                    <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
                  </svg>
                </div>
                <span className="text-xl font-semibold tracking-tight">Letter</span>
              </div>
              <p className="text-muted-foreground text-sm">AI 驱动的智能邮件外发平台</p>
            </div>

            {/* Welcome text */}
            <div className="mb-8 animate-fade-in-up opacity-0 stagger-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                {activeTab === "login" ? "欢迎回来" : "创建账号"}
              </h2>
              <p className="text-muted-foreground text-sm mt-1.5">
                {activeTab === "login" ? "登录你的账号继续使用" : "注册新账号开始使用 Letter"}
              </p>
            </div>

            {/* Google Sign-In */}
            {googleEnabled?.enabled && GOOGLE_CLIENT_ID && (
              <div className="mb-6 animate-fade-in-up opacity-0 stagger-3">
                <div id="google-signin-slot" className="flex justify-center [&>div]:!w-full" />
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-3 text-muted-foreground">或使用邮箱</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab Switcher */}
            <div className="animate-fade-in-up opacity-0 stagger-3">
              <div className="flex bg-muted rounded-xl p-1 mb-6">
                {(["login", "register"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setError(null); setFieldErrors({}); }}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                      activeTab === tab
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "login" ? "登录" : "注册"}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive" className="mb-5 animate-fade-in-up">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* ---- Login Form ---- */}
            {activeTab === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2 animate-fade-in-up opacity-0 stagger-3">
                  <Label htmlFor="login-email" className="text-sm font-medium">邮箱</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="name@example.com"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                </div>
                <div className="space-y-2 animate-fade-in-up opacity-0 stagger-4">
                  <Label htmlFor="login-password" className="text-sm font-medium">密码</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="输入密码"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                </div>
                <div className="pt-2 animate-fade-in-up opacity-0 stagger-5">
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all duration-300"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        登录中...
                      </span>
                    ) : "登录"}
                  </Button>
                </div>
                <p className="text-center text-sm text-muted-foreground animate-fade-in-up opacity-0 stagger-5">
                  还没有账号？{" "}
                  <button type="button" onClick={() => setActiveTab("register")} className="text-orange-500 hover:text-orange-600 font-medium transition-colors">
                    立即注册
                  </button>
                </p>
              </form>
            )}

            {/* ---- Register Form ---- */}
            {activeTab === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                {/* Name */}
                <div className="space-y-2 animate-fade-in-up opacity-0 stagger-2">
                  <Label htmlFor="reg-name" className="text-sm font-medium">
                    用户名 <span className="text-orange-500">*</span>
                  </Label>
                  <Input
                    id="reg-name"
                    type="text"
                    placeholder="你的名字"
                    value={registerName}
                    onChange={e => { setRegisterName(e.target.value); setFieldErrors(prev => ({ ...prev, name: "" })); }}
                    required
                    autoComplete="name"
                    className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                  {fieldErrors.name && <p className="text-xs text-red-500">{fieldErrors.name}</p>}
                </div>

                {/* Email */}
                <div className="space-y-2 animate-fade-in-up opacity-0 stagger-3">
                  <Label htmlFor="reg-email" className="text-sm font-medium">
                    邮箱 <span className="text-orange-500">*</span>
                  </Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="name@example.com"
                    value={registerEmail}
                    onChange={e => { setRegisterEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: "" })); }}
                    required
                    autoComplete="email"
                    className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                  {fieldErrors.email && <p className="text-xs text-red-500">{fieldErrors.email}</p>}
                </div>

                {/* Password */}
                <div className="space-y-2 animate-fade-in-up opacity-0 stagger-3">
                  <Label htmlFor="reg-password" className="text-sm font-medium">
                    密码 <span className="text-orange-500">*</span>
                  </Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="至少 8 位"
                    value={registerPassword}
                    onChange={e => { setRegisterPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: "" })); }}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                  {registerPassword.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex gap-1.5">
                        {[1, 2, 3].map(i => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                              i <= pwStrength.level ? pwStrength.bgColor : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-xs font-medium ${pwStrength.color}`}>
                        密码强度: {pwStrength.label}
                      </p>
                    </div>
                  )}
                  {fieldErrors.password && <p className="text-xs text-red-500">{fieldErrors.password}</p>}
                </div>

                {/* Confirm Password */}
                <div className="space-y-2 animate-fade-in-up opacity-0 stagger-4">
                  <Label htmlFor="reg-confirm-password" className="text-sm font-medium">
                    确认密码 <span className="text-orange-500">*</span>
                  </Label>
                  <Input
                    id="reg-confirm-password"
                    type="password"
                    placeholder="再次输入密码"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(prev => ({ ...prev, confirmPassword: "" })); }}
                    required
                    autoComplete="new-password"
                    className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                  {fieldErrors.confirmPassword && <p className="text-xs text-red-500">{fieldErrors.confirmPassword}</p>}
                </div>

                {/* SMTP Password */}
                <div className="space-y-2 animate-fade-in-up opacity-0 stagger-4">
                  <Label className="text-sm font-medium text-muted-foreground">
                    发件密码
                    <span className="text-xs ml-1.5 text-muted-foreground/70">(可选)</span>
                  </Label>
                  <Input
                    type="password"
                    placeholder="应用专用密码 / 授权码"
                    value={smtpPass}
                    onChange={e => setSmtpPass(e.target.value)}
                    className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Gmail 需「应用专用密码」，QQ/163 需「授权码」。
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" className="text-orange-500 hover:text-orange-600 font-medium inline-flex items-center gap-0.5 ml-1 transition-colors">
                      获取引导 <ChevronRightIcon />
                    </a>
                  </p>
                </div>

                {/* Submit */}
                <div className="pt-2 animate-fade-in-up opacity-0 stagger-5">
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all duration-300"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        创建中...
                      </span>
                    ) : "创建账号"}
                  </Button>
                </div>
                <p className="text-center text-sm text-muted-foreground animate-fade-in-up opacity-0 stagger-5">
                  已有账号？{" "}
                  <button type="button" onClick={() => setActiveTab("login")} className="text-orange-500 hover:text-orange-600 font-medium transition-colors">
                    立即登录
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
