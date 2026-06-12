import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState , useEffect} from "react";
import { useLocation } from "wouter";
import { Loader2, Mail, Plus, Trash2, Star, CheckCircle2, ArrowLeft, Shield, Settings, Eye, EyeOff, PenLine, Type, ImageIcon, X, Wand2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

const PROVIDER_INFO: Record<string, { name: string; icon: string; desc: string }> = {
    snovio: { name: "Snov.io", icon: "🔍", desc: "Snov.io 邮件营销平台" },
    gmail: { name: "Gmail", icon: "📧", desc: "Google Gmail (需开启应用专用密码)" },
    outlook: { name: "Outlook", icon: "📬", desc: "Microsoft Outlook / Hotmail" },
    qq: { name: "QQ 邮箱", icon: "📮", desc: "QQ 邮箱 (需开启 SMTP 服务)" },
    "163": { name: "网易 163", icon: "📨", desc: "网易 163 邮箱" },
    yahoo: { name: "Yahoo", icon: "📩", desc: "Yahoo Mail" },
    zoho: { name: "Zoho", icon: "✉️", desc: "Zoho Mail" },
    icloud: { name: "iCloud", icon: "☁️", desc: "Apple iCloud Mail" },
    fastmail: { name: "Fastmail", icon: "📨", desc: "Fastmail 邮箱" },
    sendgrid: { name: "SendGrid", icon: "🚀", desc: "SendGrid 邮件服务" },
    mailgun: { name: "Mailgun", icon: "🔫", desc: "Mailgun 邮件服务" },
    smtp: { name: "自定义 SMTP", icon: "⚙️", desc: "手动配置 SMTP/IMAP 服务器" },
    custom: { name: "自定义 SMTP", icon: "⚙️", desc: "手动配置 SMTP/IMAP 服务器" },
};

// IMAP presets derived from SMTP providers
const IMAP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
    snovio: { host: "imap.snov.io", port: 993, secure: true },
    gmail: { host: "imap.gmail.com", port: 993, secure: true },
    outlook: { host: "outlook.office365.com", port: 993, secure: true },
    qq: { host: "imap.qq.com", port: 993, secure: true },
    "163": { host: "imap.163.com", port: 993, secure: true },
    yahoo: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    zoho: { host: "imap.zoho.com", port: 993, secure: true },
    icloud: { host: "imap.mail.me.com", port: 993, secure: true },
    fastmail: { host: "imap.fastmail.com", port: 993, secure: true },
};

// Auto-detect email provider from domain
const EMAIL_DOMAIN_MAP: Record<string, string> = {
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


const PROVIDER_PASSWORD_GUIDE: Record<string, { title: string; steps: string[]; link: string; linkText: string }> = {
  gmail: {
    title: "Gmail 应用专用密码获取指引",
    steps: [
      "1. 登录 Google 账户，进入「账户安全性」设置",
      "2. 开启「两步验证」（如果还没开启）",
      "3. 在安全性页面找到「应用专用密码」",
      "4. 点击「生成」，选择应用类型为「邮件」",
      "5. 复制生成的 16 位密码，粘贴到上方密码框"
    ],
    link: "https://myaccount.google.com/apppasswords",
    linkText: "打开 Google 应用专用密码页面"
  },
  outlook: {
    title: "Outlook / Hotmail 密码获取指引",
    steps: [
      "1. 登录 Microsoft 账户安全设置",
      "2. 如已开启两步验证，需生成应用密码",
      "3. 如未开启两步验证，可直接使用登录密码",
      "4. 复制密码粘贴到上方密码框"
    ],
    link: "https://account.microsoft.com/security",
    linkText: "打开 Microsoft 安全设置"
  },
  qq: {
    title: "QQ 邮箱授权码获取指引",
    steps: [
      "1. 登录 QQ 邮箱网页版 (mail.qq.com)",
      "2. 进入「设置」→「账户」",
      "3. 找到「POP3/SMTP 服务」，点击「开启」",
      "4. 按提示发送短信验证",
      "5. 获取授权码，复制粘贴到上方密码框"
    ],
    link: "https://mail.qq.com",
    linkText: "打开 QQ 邮箱设置"
  },
  "163": {
    title: "163/126 邮箱授权码获取指引",
    steps: [
      "1. 登录网易邮箱网页版 (mail.163.com)",
      "2. 进入「设置」→「POP3/SMTP/IMAP」",
      "3. 开启「SMTP 服务」",
      "4. 按提示发送短信验证",
      "5. 获取授权码，复制粘贴到上方密码框"
    ],
    link: "https://mail.163.com",
    linkText: "打开网易邮箱设置"
  },
  yahoo: {
    title: "Yahoo 邮箱应用密码获取指引",
    steps: [
      "1. 登录 Yahoo 账户安全设置",
      "2. 开启「两步验证」",
      "3. 找到「生成应用密码」",
      "4. 选择应用类型，生成密码",
      "5. 复制密码粘贴到上方密码框"
    ],
    link: "https://login.yahoo.com/account/security",
    linkText: "打开 Yahoo 安全设置"
  },
  zoho: {
    title: "Zoho 邮箱应用密码获取指引",
    steps: [
      "1. 登录 Zoho Mail 设置",
      "2. 进入「安全性」设置",
      "3. 生成「应用专用密码」",
      "4. 复制密码粘贴到上方密码框"
    ],
    link: "https://accounts.zoho.com/home#security/security_pwd",
    linkText: "打开 Zoho 安全设置"
  },
  icloud: {
    title: "iCloud 应用专用密码获取指引",
    steps: [
      "1. 登录 Apple ID 账户管理页面",
      "2. 进入「登录与安全」",
      "3. 创建应用专用密码",
      "4. 复制密码粘贴到上方密码框"
    ],
    link: "https://appleid.apple.com/account/manage",
    linkText: "打开 Apple ID 设置"
  },
  fastmail: {
    title: "Fastmail 应用密码获取指引",
    steps: [
      "1. 登录 Fastmail 安全设置",
      "2. 创建一个用于邮件客户端的应用密码",
      "3. 确认该密码拥有邮件发送权限",
      "4. 复制密码粘贴到上方密码框"
    ],
    link: "https://app.fastmail.com/settings/security",
    linkText: "打开 Fastmail 安全设置"
  },
  sendgrid: {
    title: "SendGrid SMTP API Key 获取指引",
    steps: [
      "1. 登录 SendGrid 后打开 API Keys 页面",
      "2. 创建一个具备邮件发送权限的 API Key",
      "3. SMTP 用户名保持为 apikey",
      "4. 将 API Key 粘贴到密码框"
    ],
    link: "https://app.sendgrid.com/settings/api_keys",
    linkText: "打开 SendGrid API Keys"
  },
};

type AutoSetupResult = {
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

export default function EmailSettingsPage() {
    const [, setLocation] = useLocation();
    const { data: accounts, isLoading } = trpc.emailAccounts.list.useQuery();
    const { data: presets } = trpc.emailAccounts.getPresets.useQuery();
    const createAccount = trpc.emailAccounts.create.useMutation();
    const deleteAccount = trpc.emailAccounts.delete.useMutation();
    const setDefault = trpc.emailAccounts.setDefault.useMutation();
    const verifySmtp = trpc.emailAccounts.verify.useMutation();
    const sendTestEmail = trpc.emailAccounts.sendTest.useMutation();
    const detectSetup = trpc.emailAccounts.detectSetup.useMutation();
    const utils = trpc.useUtils();

  const [showAdd, setShowAdd] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState("");
    const [autoSetup, setAutoSetup] = useState<AutoSetupResult | null>(null);
    const [smtpTestPassed, setSmtpTestPassed] = useState(false);

  // Email signature and formatting state
  const [signature, setSignature] = useState('');
    const [fontSize, setFontSize] = useState(14);
    const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
    const [signatureLogoUrl, setSignatureLogoUrl] = useState<string | null>(null);
    const [signatureSaving, setSignatureSaving] = useState(false);

  const emailSettings = trpc.profile.getEmailSettings.useQuery();

  useEffect(() => {
        if (emailSettings.data) {
                setSignature(emailSettings.data.signature || '');
                setFontSize(emailSettings.data.fontSize || 14);
                setFontFamily(emailSettings.data.fontFamily || 'Arial, sans-serif');
                setSignatureLogoUrl(emailSettings.data.signatureLogoUrl || null);
        }
  }, [emailSettings.data]);

  const updateEmailSettingsMutation = trpc.profile.updateEmailSettings.useMutation({
        onSuccess: () => {
                toast.success('邮件格式设置已保存');
                setSignatureSaving(false);
        },
        onError: (err: any) => {
                toast.error('保存失败: ' + err.message);
                setSignatureSaving(false);
        },
  });

  const handleSaveSignature = () => {
        setSignatureSaving(true);
        updateEmailSettingsMutation.mutate({ signature, fontSize, fontFamily, signatureLogoUrl });
  };

  const [form, setForm] = useState({
        label: "",
        email: "",
        smtpHost: "",
        smtpPort: 587,
        smtpUser: "",
        smtpPass: "",
        testToEmail: "",
        smtpSecure: true,
        imapHost: "",
        imapPort: 993,
        imapSecure: true,
        snovioClientId: "",
        snovioClientSecret: "",
        isDefault: false,
  });

  const applyEffectiveSmtpConfig = (result: any) => {
        const effective = result?.effectiveConfig;
        if (!effective) return { changed: false, usedProxy: false };
        const changed =
          effective.smtpHost !== form.smtpHost ||
          effective.smtpPort !== form.smtpPort ||
          effective.smtpSecure !== form.smtpSecure;
        if (changed) {
                setForm(prev => ({
                          ...prev,
                          smtpHost: effective.smtpHost,
                          smtpPort: effective.smtpPort,
                          smtpSecure: effective.smtpSecure,
                }));
        }
        return { changed, usedProxy: Boolean(effective.smtpProxyUrl) };
  };

  const getSmtpFailureMessage = (result: any, fallback: string) => {
        const hint = result?.hint || fallback;
        const error = result?.error ? ` 原始错误：${result.error}` : "";
        return `${hint}${error}`;
  };

  const applyProviderPreset = (provider: string, emailValue = form.email) => {
        setSmtpTestPassed(false);
        setSelectedProvider(provider);
        const preset = presets?.find((p: any) => p.key === provider);
        const imapPreset = preset?.imapHost
          ? { host: preset.imapHost, port: preset.imapPort, secure: preset.imapSecure }
          : IMAP_PRESETS[provider];

        if (preset) {
                setForm(prev => ({
                          ...prev,
                          email: emailValue,
                          label: PROVIDER_INFO[provider]?.name || preset.label || provider,
                          smtpHost: preset.host,
                          smtpPort: preset.port,
                          smtpSecure: preset.secure,
                          smtpUser: preset.defaultUser || emailValue || prev.smtpUser,
                          imapHost: imapPreset?.host || "",
                          imapPort: imapPreset?.port || 993,
                          imapSecure: imapPreset?.secure ?? true,
                }));
        } else if (provider === "custom") {
                const domain = emailValue.split("@")[1]?.toLowerCase();
                setForm(prev => ({
                          ...prev,
                          email: emailValue,
                          label: domain ? `${domain} SMTP` : "",
                          smtpHost: domain ? `smtp.${domain}` : "",
                          smtpPort: 587,
                          smtpUser: emailValue || prev.smtpUser,
                          smtpSecure: false,
                          imapHost: domain ? `imap.${domain}` : "",
                          imapPort: 993,
                          imapSecure: true,
                }));
        }
  };

  const applyAutoSetup = (setup: AutoSetupResult) => {
        const provider = setup.provider === "custom" ? "custom" : setup.provider;
        setSmtpTestPassed(false);
        setSelectedProvider(provider);
        setAutoSetup(setup);
        setForm(prev => ({
                  ...prev,
                  label: setup.label || PROVIDER_INFO[provider]?.name || prev.label,
                  email: setup.email,
                  smtpHost: setup.smtpHost || "",
                  smtpPort: setup.smtpPort || 587,
                  smtpSecure: setup.smtpSecure,
                  smtpUser: setup.smtpUser || setup.email,
                  imapHost: setup.imapHost || "",
                  imapPort: setup.imapPort || 993,
                  imapSecure: setup.imapSecure,
        }));
  };

  const handleSelectProvider = (provider: string) => {
        setAutoSetup(null);
        applyProviderPreset(provider);
  };

  const handleAutoConfigure = async () => {
        if (!form.email) {
                toast.error("请先输入发件邮箱地址");
                return;
        }
        try {
                const setup = await detectSetup.mutateAsync({
                          email: form.email,
                          provider: selectedProvider || undefined,
                });
                applyAutoSetup(setup as AutoSetupResult);
                toast.success(setup.confidence === "known"
                  ? "已填好服务器配置，请继续填写应用密码/授权码"
                  : "已生成常见服务器配置，请核对后填写密码并验证");
        } catch (e: any) {
                toast.error("自动配置失败: " + (e.message || "邮箱格式不正确"));
        }
  };

  // Auto-detect provider from email domain
  const handleEmailChange = (email: string) => {
    setAutoSetup(null);
    setSmtpTestPassed(false);
    setForm(prev => ({ ...prev, email, smtpUser: prev.smtpUser && prev.smtpUser !== prev.email ? prev.smtpUser : email }));
    const domain = email.split("@")[1]?.toLowerCase();
    const provider = domain ? EMAIL_DOMAIN_MAP[domain] : null;
    if (provider && provider !== selectedProvider) {
      applyProviderPreset(provider, email);
    }
  };

  const handleVerify = async () => {
        if (!form.smtpHost || !form.smtpUser || !form.smtpPass) {
                toast.error("请填写完整的 SMTP 信息，密码必须是邮箱服务商生成的应用密码/授权码");
                return;
        }
        try {
                const result = await verifySmtp.mutateAsync({
                          smtpHost: form.smtpHost,
                          smtpPort: form.smtpPort,
                          smtpUser: form.smtpUser,
                          smtpPass: form.smtpPass,
                          smtpSecure: form.smtpSecure,
                });
                if (result.success) {
                          const { changed, usedProxy } = applyEffectiveSmtpConfig(result);
                          setSmtpTestPassed(false);
                          toast.success(changed
                            ? `SMTP 连接成功，已自动切换到可用端口${usedProxy ? "并通过本机代理连接" : ""}。请继续发送测试邮件。`
                            : `SMTP 连接验证成功${usedProxy ? "，已通过本机代理连接" : ""}。请继续发送测试邮件确认可用。`);
                } else {
                          setSmtpTestPassed(false);
                          toast.error(getSmtpFailureMessage(result, "SMTP 连接失败：请确认填写的是应用密码/授权码，不是邮箱登录密码。"));
                }
        } catch (e: any) {
                setSmtpTestPassed(false);
                toast.error("验证失败：请确认应用密码/授权码已开启 SMTP 权限。" + (e.message ? ` 原始错误：${e.message}` : ""));
        }
  };

  const handleSendTestEmail = async () => {
        if (!form.email || !form.smtpHost || !form.smtpUser || !form.smtpPass) {
                toast.error("请先填写邮箱、SMTP 配置和应用密码/授权码");
                return;
        }
        try {
                const result = await sendTestEmail.mutateAsync({
                          email: form.email,
                          label: form.label || PROVIDER_INFO[selectedProvider]?.name || "Letter App",
                          smtpHost: form.smtpHost,
                          smtpPort: form.smtpPort,
                          smtpUser: form.smtpUser,
                          smtpPass: form.smtpPass,
                          smtpSecure: form.smtpSecure,
                          testTo: form.testToEmail || undefined,
                });
                if (result.success) {
                          const { changed, usedProxy } = applyEffectiveSmtpConfig(result);
                          setSmtpTestPassed(true);
                          toast.success(`测试邮件已发送到 ${result.testTo || form.testToEmail || form.email}${changed ? "，并已自动切换到可用端口" : ""}${usedProxy ? "，已通过本机代理连接" : ""}`);
                } else {
                          setSmtpTestPassed(false);
                          toast.error(getSmtpFailureMessage(result, "测试邮件发送失败：请检查应用密码/授权码和 SMTP 权限。"));
                }
        } catch (e: any) {
                setSmtpTestPassed(false);
                toast.error("测试邮件发送失败: " + (e.message || "未知错误"));
        }
  };

  const handleCreate = async () => {
        if (!form.email || !selectedProvider) {
                toast.error("请填写邮箱地址并选择邮箱类型");
                return;
        }
        if (!form.smtpHost || !form.smtpPort || !form.smtpUser || !form.smtpPass) {
                toast.error("请先配置服务器，并填写邮箱服务商生成的应用密码/授权码");
                return;
        }
        if (!smtpTestPassed) {
                toast.error("请先发送测试邮件，确认该 SMTP 邮箱可以正常发信");
                return;
        }
        try {
                await createAccount.mutateAsync({
                          provider: selectedProvider === "custom" ? "smtp" : selectedProvider,
                          label: form.label || PROVIDER_INFO[selectedProvider]?.name || selectedProvider,
                          email: form.email,
                          smtpHost: form.smtpHost || undefined,
                          smtpPort: form.smtpPort || undefined,
                          smtpUser: form.smtpUser || undefined,
                          smtpPass: form.smtpPass || undefined,
                          smtpSecure: form.smtpSecure,
                          imapHost: form.imapHost || undefined,
                          imapPort: form.imapPort || undefined,
                          imapSecure: form.imapSecure,
                          snovioClientId: form.snovioClientId || undefined,
                          snovioClientSecret: form.snovioClientSecret || undefined,
                          isDefault: form.isDefault || (!accounts || accounts.length === 0),
                });
                toast.success("邮箱账户添加成功！");
                setShowAdd(false);
                resetForm();
                utils.emailAccounts.list.invalidate();
        } catch (e: any) {
                toast.error("添加失败: " + (e.message || "未知错误"));
        }
  };

  const handleDelete = async (accountId: number) => {
        try {
                await deleteAccount.mutateAsync({ accountId });
                toast.success("邮箱账户已删除");
                utils.emailAccounts.list.invalidate();
        } catch (e: any) {
                toast.error("删除失败: " + (e.message || "未知错误"));
        }
  };

  const handleSetDefault = async (accountId: number) => {
        try {
                await setDefault.mutateAsync({ accountId });
                toast.success("已设为默认发件邮箱");
                utils.emailAccounts.list.invalidate();
        } catch (e: any) {
                toast.error("设置失败: " + (e.message || "未知错误"));
        }
  };

  const resetForm = () => {
        setSelectedProvider("");
        setAutoSetup(null);
        setSmtpTestPassed(false);
        setForm({
                label: "",
                email: "",
                smtpHost: "",
                smtpPort: 587,
                smtpUser: "",
                smtpPass: "",
                testToEmail: "",
                smtpSecure: true,
                imapHost: "",
                imapPort: 993,
                imapSecure: true,
                snovioClientId: "",
                snovioClientSecret: "",
                isDefault: false,
        });
        setShowPassword(false);
  };

  if (isLoading) {
        return (
                <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              );
  }
  
    return (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
                <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => setLocation("/automation")}>
                                  <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                                  <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                                              <Settings className="h-6 w-6 text-primary" />
                                              邮箱设置
                                  </h1>
                                  <p className="text-muted-foreground mt-1">
                                              配置发件邮箱（SMTP 发送 + IMAP 收信检测），支持 Snov.io、Gmail、Outlook、QQ邮箱等
                                  </p>
                        </div>
                </div>
          
            {/* Help Card */}
                <Card className="border-blue-500/20 bg-blue-500/5">
                        <CardContent className="py-4">
                                  <div className="flex items-start gap-3">
                                              <Shield className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                                              <div className="text-sm space-y-1">
                                                            <p className="font-medium">安全提示</p>
                                                            <p className="text-muted-foreground">
                                                                            所有邮箱密码均加密存储。建议使用<strong>应用专用密码</strong>而非登录密码。
                                                                            系统会通过 SMTP 发送邮件，通过 IMAP 自动检测客户回信。
                                                            </p>
                                              </div>
                                  </div>
                        </CardContent>
                </Card>
          
            {/* Email Format Settings */}
                <Card>
                        <CardHeader>
                                  <CardTitle className="flex items-center gap-2">
                                              <PenLine className="h-5 w-5 text-primary" />
                                              邮件格式设置
                                  </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                                  <div className="space-y-2">
                                              <Label className="flex items-center gap-1.5 text-sm font-medium">
                                                            <Type className="h-4 w-4" />
                                                            邮件签名
                                              </Label>
                                              <Textarea
                                                              placeholder={"在此输入您的邮件签名，例如：\n\n祝好，\n张三 | 销售总监\nexample@company.com"}
                                                              value={signature}
                                                              onChange={(e) => setSignature(e.target.value)}
                                                              rows={5}
                                                              className="resize-y text-sm"
                                                            />
                                              <p className="text-xs text-muted-foreground">签名将自动附加在每封发出的邮件末尾</p>
                                  </div>
                        
                                  <div className="space-y-2">
                                              <Label className="flex items-center gap-1.5 text-sm font-medium">
                                                            <ImageIcon className="h-4 w-4" />
                                                            签名 Logo（可选）
                                              </Label>
                                              <div className="flex items-center gap-3">
                                                {signatureLogoUrl ? (
                            <div className="relative inline-block">
                                              <img
                                                                    src={signatureLogoUrl}
                                                                    alt="Logo"
                                                                    className="h-12 max-w-[200px] object-contain rounded border"
                                                                  />
                                              <button
                                                                    type="button"
                                                                    onClick={() => setSignatureLogoUrl(null)}
                                                                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center hover:opacity-80"
                                                                  >
                                                                  <X className="h-2.5 w-2.5" />
                                              </button>
                            </div>
                          ) : (
                            <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-md cursor-pointer hover:bg-accent/50 text-sm text-muted-foreground">
                                              <ImageIcon className="h-4 w-4" />
                                              上传图片（PNG / JPG / SVG，建议高度 40-60px）
                                              <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    className="hidden"
                                                                    onChange={(e) => {
                                                                                            const file = e.target.files?.[0];
                                                                                            if (!file) return;
                                                                                            if (file.size > 2 * 1024 * 1024) {
                                                                                                                      toast.error("图片大小不能超过 2MB");
                                                                                                                      return;
                                                                                              }
                                                                                            const reader = new FileReader();
                                                                                            reader.onload = (ev) => {
                                                                                                                      setSignatureLogoUrl(ev.target?.result as string);
                                                                                              };
                                                                                            reader.readAsDataURL(file);
                                                                    }}
                                                                  />
                            </label>
                                                            )}
                                              </div>
                                              <p className="text-xs text-muted-foreground">Logo 将显示在签名文字上方，以 base64 嵌入邮件</p>
                                  </div>
                        
                                  <Separator />
                        
                                  <div className="grid grid-cols-2 gap-4">
                                              <div className="space-y-2">
                                                            <Label className="text-sm font-medium">字号</Label>
                                                            <Select value={String(fontSize)} onValueChange={(v) => setFontSize(Number(v))}>
                                                                            <SelectTrigger>
                                                                                              <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                              {[10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((s) => (
                                <SelectItem key={s} value={String(s)}>{s}px</SelectItem>
                              ))}
                                                                            </SelectContent>
                                                            </Select>
                                              </div>
                                              <div className="space-y-2">
                                                            <Label className="text-sm font-medium">字体</Label>
                                                            <Select value={fontFamily} onValueChange={setFontFamily}>
                                                                            <SelectTrigger>
                                                                                              <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                              <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                                                                                              <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
                                                                                              <SelectItem value="'Helvetica Neue', sans-serif">Helvetica Neue</SelectItem>
                                                                                              <SelectItem value="Georgia, serif">Georgia</SelectItem>
                                                                                              <SelectItem value="'Courier New', monospace">Courier New</SelectItem>
                                                                                              <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
                                                                                              <SelectItem value="Tahoma, sans-serif">Tahoma</SelectItem>
                                                                            </SelectContent>
                                                            </Select>
                                              </div>
                                  </div>
                        
                                  <div className="space-y-2">
                                              <Label className="text-sm font-medium">预览效果</Label>
                                              <div
                                                              className="p-3 rounded-md border bg-muted/30 min-h-[60px]"
                                                              style={{ fontSize: fontSize + 'px', fontFamily }}
                                                            >
                                                {signatureLogoUrl && (
                                                                              <img
                                                                                                  src={signatureLogoUrl}
                                                                                                  alt="Logo"
                                                                                                  className="h-10 max-w-[180px] object-contain mb-2 block"
                                                                                                />
                                                                            )}
                                                {signature ? (
                                                                              <pre className="whitespace-pre-wrap m-0" style={{ fontFamily, fontSize }}>{signature}</pre>
                                                                            ) : (
                                                                              <p className="text-muted-foreground text-sm italic">（暂无签名）</p>
                                                            )}
                                              </div>
                                  </div>
                        
                                  <Button onClick={handleSaveSignature} disabled={signatureSaving}>
                                    {signatureSaving ? (
                          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />保存中...</span>
                        ) : '保存格式设置'}
                                  </Button>
                        </CardContent>
                </Card>
          
            {/* Account List */}
                <div className="space-y-3">
                        <div className="flex items-center justify-between">
                                  <h2 className="text-lg font-semibold">已配置的邮箱 ({accounts?.length || 0})</h2>
                                  <Button onClick={() => { resetForm(); setShowAdd(true); }}>
                                              <Plus className="h-4 w-4 mr-2" />
                                              添加邮箱
                                  </Button>
                        </div>
                
                  {(!accounts || accounts.length === 0) ? (
                      <Card className="border-dashed">
                                  <CardContent className="py-12 text-center">
                                                <Mail className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                                                <p className="text-muted-foreground">尚未配置任何发件邮箱</p>
                                                <p className="text-sm text-muted-foreground/60 mt-1">
                                                                添加邮箱后即可发送邮件并自动检测客户回信
                                                </p>
                                                <Button className="mt-4" onClick={() => { resetForm(); setShowAdd(true); }}>
                                                                <Plus className="h-4 w-4 mr-2" />
                                                                添加第一个邮箱
                                                </Button>
                                  </CardContent>
                      </Card>
                    ) : (
                      accounts.map((account: any) => (
                                    <Card key={account.id} className={account.isDefault ? "border-primary/30" : ""}>
                                                  <CardContent className="py-4">
                                                                  <div className="flex items-center justify-between">
                                                                                    <div className="flex items-center gap-3 min-w-0">
                                                                                                        <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center shrink-0 text-lg">
                                                                                                          {PROVIDER_INFO[account.provider]?.icon || "📧"}
                                                                                                          </div>
                                                                                                        <div className="min-w-0">
                                                                                                                              <div className="flex items-center gap-2">
                                                                                                                                                      <p className="text-sm font-medium truncate">{account.label}</p>
                                                                                                                                {account.isDefault && (
                                                                <Badge variant="outline" className="text-xs text-primary border-primary/30">
                                                                                            <Star className="h-3 w-3 mr-1 fill-current" />默认
                                                                </Badge>
                                                                                                                                                      )}
                                                                                                                                                      <Badge variant="secondary" className="text-[10px]">
                                                                                                                                                        {PROVIDER_INFO[account.provider]?.name || account.provider}
                                                                                                                                                        </Badge>
                                                                                                                                </div>
                                                                                                                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                                                                                                {account.email}
                                                                                                                                {account.imapHost && <span className="ml-2 text-green-500">IMAP 已配置</span>}
                                                                                                                                </p>
                                                                                                          </div>
                                                                                      </div>
                                                                                    <div className="flex items-center gap-1 shrink-0">
                                                                                      {!account.isDefault && (
                                                            <Button
                                                                                      variant="ghost"
                                                                                      size="sm"
                                                                                      onClick={() => handleSetDefault(account.id)}
                                                                                      disabled={setDefault.isPending}
                                                                                      className="text-xs"
                                                                                    >
                                                                                    <Star className="h-3 w-3 mr-1" />设为默认
                                                            </Button>
                                                                                                        )}
                                                                                                        <Button
                                                                                                                                variant="ghost"
                                                                                                                                size="icon"
                                                                                                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                                                                                                onClick={() => handleDelete(account.id)}
                                                                                                                                disabled={deleteAccount.isPending}
                                                                                                                              >
                                                                                                                              <Trash2 className="h-4 w-4" />
                                                                                                          </Button>
                                                                                      </div>
                                                                  </div>
                                                  </CardContent>
                                    </Card>
                                  ))
                    )}
                </div>
          
            {/* Add Account Dialog */}
                <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) resetForm(); }}>
                        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                                  <DialogHeader>
                                              <DialogTitle>添加发件邮箱</DialogTitle>
                                              <DialogDescription>
                                                            输入邮箱后自动填写服务器参数，密码/授权码需要从邮箱服务商获取
                                              </DialogDescription>
                                  </DialogHeader>
                        
                                  <div className="space-y-4">
                                    <Card className="border-primary/20 bg-primary/5">
                                      <CardContent className="py-4 space-y-3">
                                        <div className="flex items-start gap-2">
                                          <Wand2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                          <div>
                                            <p className="text-sm font-medium">一键配置服务器</p>
                                            <p className="text-xs text-muted-foreground">系统会识别邮箱并填写 SMTP/IMAP 主机、端口和加密方式；不会自动生成邮箱密码。</p>
                                          </div>
                                        </div>
                                        <div className="flex gap-2">
                                          <Input
                                            type="email"
                                            value={form.email}
                                            onChange={e => handleEmailChange(e.target.value)}
                                            placeholder="your@email.com"
                                            className="min-w-0"
                                          />
                                          <Button
                                            type="button"
                                            onClick={handleAutoConfigure}
                                            disabled={detectSetup.isPending || !form.email}
                                            className="shrink-0"
                                          >
                                            {detectSetup.isPending ? (
                                              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />配置中</span>
                                            ) : (
                                              <span className="flex items-center gap-2"><Wand2 className="h-4 w-4" />配置服务器</span>
                                            )}
                                          </Button>
                                        </div>
                                        {autoSetup && (
                                          <div className="rounded-md border bg-background/80 px-3 py-2 text-xs text-muted-foreground space-y-1">
                                            <p className="font-medium text-foreground flex items-center gap-1.5">
                                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                              已应用 {PROVIDER_INFO[selectedProvider]?.name || autoSetup.label} 配置
                                            </p>
                                            <p>SMTP: {form.smtpHost}:{form.smtpPort} · {form.smtpSecure ? "SSL/TLS" : "STARTTLS"}</p>
                                            {form.imapHost && <p>IMAP: {form.imapHost}:{form.imapPort} · {form.imapSecure ? "SSL/TLS" : "STARTTLS"}</p>}
                                            <p>{autoSetup.authHelp}</p>
                                            <p className="text-amber-600">密码不能由软件自动配置，请使用邮箱服务商生成的应用密码/授权码。</p>
                                            {autoSetup.manualConfigRequired && (
                                              <p className="text-amber-600">这是按域名生成的常见配置，保存前请先验证 SMTP。</p>
                                            )}
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>

                                    {/* Provider Selection */}
                                              <div className="space-y-2">
                                                            <Label>邮箱类型（可手动调整）</Label>
                                                            <Select value={selectedProvider} onValueChange={handleSelectProvider}>
                                                                            <SelectTrigger>
                                                                                              <SelectValue placeholder="选择邮箱类型..." />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                              <SelectItem value="snovio">🔍 Snov.io（推荐）</SelectItem>
                                                                                              <SelectItem value="gmail">📧 Gmail</SelectItem>
                                                                                              <SelectItem value="outlook">📬 Outlook / Hotmail</SelectItem>
                                                                                              <SelectItem value="qq">📮 QQ 邮箱</SelectItem>
                                                                                              <SelectItem value="163">📨 网易 163</SelectItem>
                                                                                              <SelectItem value="yahoo">📩 Yahoo Mail</SelectItem>
                                                                                              <SelectItem value="zoho">✉️ Zoho Mail</SelectItem>
                                                                                              <SelectItem value="icloud">☁️ iCloud Mail</SelectItem>
                                                                                              <SelectItem value="fastmail">📨 Fastmail</SelectItem>
                                                                                              <SelectItem value="sendgrid">🚀 SendGrid</SelectItem>
                                                                                              <SelectItem value="mailgun">🔫 Mailgun</SelectItem>
                                                                                              <SelectItem value="custom">⚙️ 自定义 SMTP</SelectItem>
                                                                            </SelectContent>
                                                            </Select>
                                              </div>
                                  
                                    {selectedProvider && (
                          <>
                            {/* Provider-specific hints */}
                            {selectedProvider === "snovio" && (
                                              <Card className="border-blue-500/20 bg-blue-500/5">
                                                                  <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
                                                                                        <p className="font-medium text-foreground">Snov.io 配置说明</p>
                                                                                        <p>使用 Snov.io 的 SMTP 中继服务发送邮件，IMAP 接收回信。</p>
                                                                                        <p>SMTP/IMAP 用户名填写你的 Snov.io 登录邮箱，密码填写 Snov.io 账号密码。</p>
                                                                  </CardContent>
                                              </Card>
                                          )}
                            {selectedProvider === "gmail" && (
                                              <Card className="border-amber-500/20 bg-amber-500/5">
                                                                  <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
                                                                                        <p className="font-medium text-foreground">Gmail 配置说明</p>
                                                                                        <p>1. 前往 Google 账号 → 安全性 → 两步验证（必须开启）</p>
                                                                                        <p>2. 搜索"应用专用密码"，生成一个新密码</p>
                                                                                        <p>3. 将生成的16位密码填入下方 SMTP 密码字段</p>
                                                                  </CardContent>
                                              </Card>
                                          )}
                            {selectedProvider === "qq" && (
                                              <Card className="border-amber-500/20 bg-amber-500/5">
                                                                  <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
                                                                                        <p className="font-medium text-foreground">QQ 邮箱配置说明</p>
                                                                                        <p>1. 登录 QQ 邮箱 → 设置 → 账户 → POP3/SMTP 服务（开启）</p>
                                                                                        <p>2. 按提示发送短信获取授权码</p>
                                                                                        <p>3. 将授权码填入下方 SMTP 密码字段</p>
                                                                  </CardContent>
                                              </Card>
                                          )}
                          
                                          <Separator />
                          
                            {/* Common Fields */}
                                          <div className="space-y-1.5">
                                                            <Label className="text-xs">显示名称</Label>
                                                            <Input
                                                                                    value={form.label}
                                                                                    onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
                                                                                    placeholder="如：我的 Gmail"
                                                                                  />
                                          </div>
                                          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                                            发件邮箱：<span className="text-foreground">{form.email}</span>
                                          </div>
                          
                            {/* SMTP Fields */}
                                          <div className="space-y-3">
                                                            <p className="text-sm font-medium">SMTP 发送设置</p>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                                <div className="space-y-1.5">
                                                                                                      <Label className="text-xs">SMTP 服务器</Label>
                                                                                                      <Input
                                                                                                                                value={form.smtpHost}
                                                                                                                                onChange={e => { setSmtpTestPassed(false); setForm(prev => ({ ...prev, smtpHost: e.target.value })); }}
                                                                                                                                placeholder="smtp.example.com"
                                                                                                                                disabled={selectedProvider !== "custom"}
                                                                                                                              />
                                                                                  </div>
                                                                                <div className="space-y-1.5">
                                                                                                      <Label className="text-xs">端口</Label>
                                                                                                      <Input
                                                                                                                                type="number"
                                                                                                                                value={form.smtpPort}
                                                                                                                                onChange={e => { setSmtpTestPassed(false); setForm(prev => ({ ...prev, smtpPort: parseInt(e.target.value) || 587 })); }}
                                                                                                                                disabled={selectedProvider !== "custom"}
                                                                                                                              />
                                                                                  </div>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                                <Label className="text-xs">SMTP 用户名（通常是邮箱地址）</Label>
                                                                                <Input
                                                                                                        value={form.smtpUser}
                                                                                                        onChange={e => { setSmtpTestPassed(false); setForm(prev => ({ ...prev, smtpUser: e.target.value })); }}
                                                                                                        placeholder="your@email.com"
                                                                                                      />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                                <Label className="text-xs">{autoSetup?.authLabel || "SMTP 密码 / 授权码"}</Label>
                                                                                <div className="relative">
                                                                                                      <Input
                                                                                                                                type={showPassword ? "text" : "password"}
                                                                                                                                value={form.smtpPass}
                                                                                                                                onChange={e => { setSmtpTestPassed(false); setForm(prev => ({ ...prev, smtpPass: e.target.value })); }}
                                                                                                                                placeholder={autoSetup?.authLabel || "应用专用密码或授权码"}
                                                                                                                                className="pr-10"
                                                                                                                              />
                                                                                                      <button
                                                                                                                                type="button"
                                                                                                                                onClick={() => setShowPassword(!showPassword)}
                                                                                                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                                                                                              >
                                                                                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                                                                        </button>
                                                                                  </div>
                                                              {selectedProvider !== "custom" && PROVIDER_PASSWORD_GUIDE[selectedProvider] && (
                                                                <button
                                                                  type="button"
                                                                  onClick={() => setShowGuide(true)}
                                                                  className="mt-1 text-xs text-orange-600 hover:text-orange-800 hover:underline flex items-center gap-1"
                                                                >
                                                                  <Shield className="h-3 w-3" />
                                                                  如何获取{selectedProvider === "qq" || selectedProvider === "163" ? "授权码" : selectedProvider === "sendgrid" ? "API Key" : "应用密码"}？
                                                                </button>
                                                              )}
                                                              <p className="mt-1 text-xs text-muted-foreground">
                                                                这里通常不能填写邮箱登录密码，需要填写邮箱服务商生成的应用密码/授权码。
                                                              </p>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                                <Label className="text-xs">测试收件邮箱（可选）</Label>
                                                                                <Input
                                                                                                        type="email"
                                                                                                        value={form.testToEmail}
                                                                                                        onChange={e => { setSmtpTestPassed(false); setForm(prev => ({ ...prev, testToEmail: e.target.value })); }}
                                                                                                        placeholder={`默认发送到 ${form.email || "发件邮箱"}`}
                                                                                                      />
                                                                                <p className="text-xs text-muted-foreground">
                                                                                  保存前必须成功发送一封测试邮件，默认发到当前发件邮箱。
                                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                                <Switch
                                                                                                        checked={form.smtpSecure}
                                                                                                        onCheckedChange={v => { setSmtpTestPassed(false); setForm(prev => ({ ...prev, smtpSecure: v })); }}
                                                                                                        disabled={selectedProvider !== "custom"}
                                                                                                      />
                                                                                <Label className="text-xs">使用 TLS/SSL 加密</Label>
                                                            </div>
                                          </div>
                          
                            {/* Verify and test buttons */}
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            <Button
                                                                                variant="outline"
                                                                                onClick={handleVerify}
                                                                                disabled={verifySmtp.isPending || sendTestEmail.isPending || !form.smtpHost || !form.smtpUser || !form.smtpPass}
                                                                                className="w-full"
                                                                              >
                                                              {verifySmtp.isPending ? (
                                                                                                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin mr-2" /> 验证中...</span>
                                                                                                    ) : (
                                                                                                      <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 mr-2" /> 验证连接</span>
                                                                              )}
                                                            </Button>
                                                            <Button
                                                                                onClick={handleSendTestEmail}
                                                                                disabled={sendTestEmail.isPending || verifySmtp.isPending || !form.email || !form.smtpHost || !form.smtpUser || !form.smtpPass}
                                                                                className="w-full"
                                                                              >
                                                              {sendTestEmail.isPending ? (
                                                                                                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin mr-2" /> 发送中...</span>
                                                                                                    ) : (
                                                                                                      <span className="flex items-center gap-2"><Mail className="h-4 w-4 mr-2" /> 发送测试邮件</span>
                                                                              )}
                                                            </Button>
                                          </div>
                                          {smtpTestPassed && (
                                            <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-700">
                                              测试邮件已发送成功，可以保存该邮箱配置。
                                            </div>
                                          )}
                          
                            {/* IMAP Fields (Collapsible) */}
                                          <Accordion type="single" collapsible defaultValue={selectedProvider === "custom" ? "imap" : undefined}>
                                                            <AccordionItem value="imap" className="border rounded-lg px-3">
                                                                                <AccordionTrigger className="text-sm font-medium py-3">
                                                                                                      IMAP 收信设置（用于自动检测客户回信）
                                                                                  </AccordionTrigger>
                                                                                <AccordionContent className="space-y-3 pb-4">
                                                                                                      <p className="text-xs text-muted-foreground">
                                                                                                        {selectedProvider !== "custom"
                                                                                                                                    ? "IMAP 设置已根据邮箱类型自动填充。如需修改请切换到「自定义 SMTP」。"
                                                                                                                                    : "请手动填写 IMAP 服务器信息，用于自动检测客户回信。"}
                                                                                                        </p>
                                                                                                      <div className="grid grid-cols-2 gap-3">
                                                                                                                              <div className="space-y-1.5">
                                                                                                                                                        <Label className="text-xs">IMAP 服务器</Label>
                                                                                                                                                        <Input
                                                                                                                                                                                      value={form.imapHost}
                                                                                                                                                                                      onChange={e => setForm(prev => ({ ...prev, imapHost: e.target.value }))}
                                                                                                                                                                                      placeholder="imap.example.com"
                                                                                                                                                                                      disabled={selectedProvider !== "custom"}
                                                                                                                                                                                    />
                                                                                                                                </div>
                                                                                                                              <div className="space-y-1.5">
                                                                                                                                                        <Label className="text-xs">端口</Label>
                                                                                                                                                        <Input
                                                                                                                                                                                      type="number"
                                                                                                                                                                                      value={form.imapPort}
                                                                                                                                                                                      onChange={e => setForm(prev => ({ ...prev, imapPort: parseInt(e.target.value) || 993 }))}
                                                                                                                                                                                      disabled={selectedProvider !== "custom"}
                                                                                                                                                                                    />
                                                                                                                                </div>
                                                                                                        </div>
                                                                                                      <div className="flex items-center gap-2">
                                                                                                                              <Switch
                                                                                                                                                          checked={form.imapSecure}
                                                                                                                                                          onCheckedChange={v => setForm(prev => ({ ...prev, imapSecure: v }))}
                                                                                                                                                          disabled={selectedProvider !== "custom"}
                                                                                                                                                        />
                                                                                                                              <Label className="text-xs">使用 TLS/SSL 加密</Label>
                                                                                                        </div>
                                                                                                      <p className="text-[10px] text-muted-foreground/60">
                                                                                                                              IMAP 使用与 SMTP 相同的用户名和密码进行认证
                                                                                                        </p>
                                                                                  </AccordionContent>
                                                            </AccordionItem>
                                          </Accordion>
                          
                            {/* Snov.io specific fields */}
                            {selectedProvider === "snovio" && (
                                              <div className="space-y-3">
                                                                  <p className="text-sm font-medium">Snov.io API 凭证（可选，用于数据丰富）</p>
                                                                  <div className="grid grid-cols-2 gap-3">
                                                                                        <div className="space-y-1.5">
                                                                                                                <Label className="text-xs">Client ID</Label>
                                                                                                                <Input
                                                                                                                                            value={form.snovioClientId}
                                                                                                                                            onChange={e => setForm(prev => ({ ...prev, snovioClientId: e.target.value }))}
                                                                                                                                            placeholder="可选"
                                                                                                                                          />
                                                                                          </div>
                                                                                        <div className="space-y-1.5">
                                                                                                                <Label className="text-xs">Client Secret</Label>
                                                                                                                <Input
                                                                                                                                            type="password"
                                                                                                                                            value={form.snovioClientSecret}
                                                                                                                                            onChange={e => setForm(prev => ({ ...prev, snovioClientSecret: e.target.value }))}
                                                                                                                                            placeholder="可选"
                                                                                                                                          />
                                                                                          </div>
                                                                  </div>
                                              </div>
                                          )}
                          
                            {/* Default Toggle */}
                                          <div className="flex items-center gap-2">
                                                            <Switch
                                                                                  checked={form.isDefault}
                                                                                  onCheckedChange={v => setForm(prev => ({ ...prev, isDefault: v }))}
                                                                                />
                                                            <Label className="text-xs">设为默认发件邮箱</Label>
                                          </div>
                          </>
                        )}
                                  </div>
                        
                                  <DialogFooter>
                                              <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>取消</Button>
                                              <Button
                                                              onClick={handleCreate}
                                                              disabled={createAccount.isPending || !selectedProvider || !form.email || !form.smtpHost || !form.smtpUser || !form.smtpPass || !smtpTestPassed}
                                                            >
                                                {createAccount.isPending ? (
                                                                              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin mr-2" /> 添加中...</span>
                                                                            ) : (
                                                                              <span className="flex items-center gap-2"><Plus className="h-4 w-4 mr-2" /> {smtpTestPassed ? "添加邮箱" : "先发送测试邮件"}</span>
                                                            )}
                                              </Button>
                                  </DialogFooter>
                        </DialogContent>
                </Dialog>
          {/* Password Guide Dialog */}
          <Dialog open={showGuide} onOpenChange={setShowGuide}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-orange-500" />
                  {PROVIDER_PASSWORD_GUIDE[selectedProvider]?.title || "密码获取指引"}
                </DialogTitle>
                <DialogDescription>
                  注意：此处需要填写的不是您的登录密码，而是邮箱提供商生成的专用密码/授权码。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {PROVIDER_PASSWORD_GUIDE[selectedProvider]?.steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowGuide(false)}
                >
                  我知道了
                </Button>
                <Button
                  onClick={() => {
                    window.open(PROVIDER_PASSWORD_GUIDE[selectedProvider]?.link, "_blank");
                  }}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {PROVIDER_PASSWORD_GUIDE[selectedProvider]?.linkText || "打开设置页面"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        );
      }
