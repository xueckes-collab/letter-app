import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { GOOGLE_CLIENT_ID } from "@/const";

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

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const utils = trpc.useUtils();
  const { data: googleEnabled } = trpc.auth.googleEnabled.useQuery();

  useEffect(() => {
    if (!googleEnabled?.enabled || !GOOGLE_CLIENT_ID || typeof window === 'undefined') return;

    const existingScript = document.getElementById('google-identity-script') as HTMLScriptElement | null;

    const initialize = () => {
      const google = (window as any).google;
      const slot = document.getElementById('google-signin-slot');
      if (!google?.accounts?.id || !slot) return;
      slot.innerHTML = '';
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: any) => {
          if (response?.credential) handleGoogleLogin(response.credential);
        },
      });
      google.accounts.id.renderButton(slot, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'signin_with',
        shape: 'pill',
      });
    };

    if (existingScript) {
      if ((window as any).google?.accounts?.id) initialize();
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-identity-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initialize;
    document.head.appendChild(script);
  }, [googleEnabled?.enabled]);

  const getNextPath = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "/";
  };

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
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
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
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: registerEmail, password: registerPassword, name: registerName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      // Auto-create email account if smtpPass was provided
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
                provider: preset.provider,
                label: preset.label,
                email: registerEmail,
                smtpHost: preset.host,
                smtpPort: preset.port,
                smtpUser: registerEmail,
                smtpPass: smtpPass,
                smtpSecure: preset.secure,
                imapHost: preset.imapHost,
                imapPort: preset.imapPort,
                imapSecure: preset.imapSecure,
                isDefault: true,
              }}}),
            });
          }
        } catch (e) {
          // Email account creation failure should not block registration
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
      if (!res.ok) {
        setError(data.error || "Google login failed");
        return;
      }
      await utils.auth.me.invalidate();
      navigate(getNextPath());
    } catch {
      setError("Google login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Letter App</h1>
          <p className="text-muted-foreground mt-2">AI-powered outreach, automated follow-ups</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Welcome</CardTitle>
            <CardDescription>Sign in to your account or create a new one</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {googleEnabled?.enabled && GOOGLE_CLIENT_ID && (
              <div className="mb-4 space-y-3">
                <div id="google-signin-slot" className="flex justify-center" />
                <p className="text-center text-xs text-muted-foreground">支持谷歌一键登录</p>
              </div>
            )}
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Name</Label>
                    <Input
                      id="reg-name"
                      type="text"
                      placeholder="Your name"
                      value={registerName}
                      onChange={e => setRegisterName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="you@example.com"
                      value={registerEmail}
                      onChange={e => setRegisterEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="At least 6 characters"
                      value={registerPassword}
                      onChange={e => setRegisterPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>发件邮箱密码（应用专用密码 / 授权码）</Label>
                    <Input
                      type="password"
                      placeholder="非登录密码，需到邮箱设置中获取"
                      value={smtpPass}
                      onChange={e => setSmtpPass(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Gmail 需「应用专用密码」，QQ/163 需「授权码」。
                      <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" className="text-orange-600 hover:underline ml-1">获取指引 →</a>
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
