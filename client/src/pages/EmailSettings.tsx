import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Loader2, Mail, Plus, Trash2, Star, CheckCircle2,
  ArrowLeft, Shield, Settings, Eye, EyeOff
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

const PROVIDER_INFO: Record<string, { name: string; icon: string; desc: string }> = {
  snovio: { name: "Snov.io", icon: "🔍", desc: "Snov.io 邮件营销平台" },
  gmail: { name: "Gmail", icon: "📧", desc: "Google Gmail (需开启应用专用密码)" },
  outlook: { name: "Outlook", icon: "📬", desc: "Microsoft Outlook / Hotmail" },
  qq: { name: "QQ 邮箱", icon: "📮", desc: "QQ 邮箱 (需开启 SMTP 服务)" },
  "163": { name: "网易 163", icon: "📨", desc: "网易 163 邮箱" },
  yahoo: { name: "Yahoo", icon: "📩", desc: "Yahoo Mail" },
  zoho: { name: "Zoho", icon: "✉️", desc: "Zoho Mail" },
  sendgrid: { name: "SendGrid", icon: "🚀", desc: "SendGrid 邮件服务" },
  mailgun: { name: "Mailgun", icon: "🔫", desc: "Mailgun 邮件服务" },
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
};

export default function EmailSettingsPage() {
  const [, setLocation] = useLocation();
  const { data: accounts, isLoading } = trpc.emailAccounts.list.useQuery();
  const { data: presets } = trpc.emailAccounts.getPresets.useQuery();
  const createAccount = trpc.emailAccounts.create.useMutation();
  const deleteAccount = trpc.emailAccounts.delete.useMutation();
  const setDefault = trpc.emailAccounts.setDefault.useMutation();
  const verifySmtp = trpc.emailAccounts.verify.useMutation();
  const utils = trpc.useUtils();

  const [showAdd, setShowAdd] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [form, setForm] = useState({
    label: "",
    email: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpSecure: true,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    snovioClientId: "",
    snovioClientSecret: "",
    isDefault: false,
  });

  const handleSelectProvider = (provider: string) => {
    setSelectedProvider(provider);
    const preset = presets?.find((p: any) => p.key === provider);
    const imapPreset = IMAP_PRESETS[provider];
    if (preset) {
      setForm(prev => ({
        ...prev,
        label: PROVIDER_INFO[provider]?.name || provider,
        smtpHost: preset.host,
        smtpPort: preset.port,
        smtpSecure: preset.secure,
        imapHost: imapPreset?.host || "",
        imapPort: imapPreset?.port || 993,
        imapSecure: imapPreset?.secure ?? true,
      }));
    } else if (provider === "custom") {
      setForm(prev => ({
        ...prev,
        label: "",
        smtpHost: "",
        smtpPort: 587,
        smtpSecure: true,
        imapHost: "",
        imapPort: 993,
        imapSecure: true,
      }));
    }
  };

  const handleVerify = async () => {
    if (!form.smtpHost || !form.smtpUser || !form.smtpPass) {
      toast.error("请填写完整的 SMTP 信息");
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
        toast.success("SMTP 连接验证成功！");
      } else {
        toast.error("SMTP 连接失败: " + (result.error || "未知错误"));
      }
    } catch (e: any) {
      toast.error("验证失败: " + (e.message || "未知错误"));
    }
  };

  const handleCreate = async () => {
    if (!form.email || !selectedProvider) {
      toast.error("请填写邮箱地址并选择邮箱类型");
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
    setForm({
      label: "", email: "", smtpHost: "", smtpPort: 587,
      smtpUser: "", smtpPass: "", smtpSecure: true,
      imapHost: "", imapPort: 993, imapSecure: true,
      snovioClientId: "", snovioClientSecret: "", isDefault: false,
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
                        variant="ghost" size="sm"
                        onClick={() => handleSetDefault(account.id)}
                        disabled={setDefault.isPending}
                        className="text-xs"
                      >
                        <Star className="h-3 w-3 mr-1" />设为默认
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
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
              选择邮箱类型，系统会自动填充 SMTP 和 IMAP 设置
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Provider Selection */}
            <div className="space-y-2">
              <Label>邮箱类型</Label>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">显示名称</Label>
                    <Input
                      value={form.label}
                      onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="如：我的 Gmail"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">发件邮箱地址</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                {/* SMTP Fields */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">SMTP 发送设置</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">SMTP 服务器</Label>
                      <Input
                        value={form.smtpHost}
                        onChange={e => setForm(prev => ({ ...prev, smtpHost: e.target.value }))}
                        placeholder="smtp.example.com"
                        disabled={selectedProvider !== "custom"}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">端口</Label>
                      <Input
                        type="number"
                        value={form.smtpPort}
                        onChange={e => setForm(prev => ({ ...prev, smtpPort: parseInt(e.target.value) || 587 }))}
                        disabled={selectedProvider !== "custom"}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">SMTP 用户名（通常是邮箱地址）</Label>
                    <Input
                      value={form.smtpUser}
                      onChange={e => setForm(prev => ({ ...prev, smtpUser: e.target.value }))}
                      placeholder="your@email.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">SMTP 密码 / 授权码</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={form.smtpPass}
                        onChange={e => setForm(prev => ({ ...prev, smtpPass: e.target.value }))}
                        placeholder="应用专用密码或授权码"
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
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.smtpSecure}
                      onCheckedChange={v => setForm(prev => ({ ...prev, smtpSecure: v }))}
                      disabled={selectedProvider !== "custom"}
                    />
                    <Label className="text-xs">使用 TLS/SSL 加密</Label>
                  </div>
                </div>

                {/* Verify SMTP Button */}
                <Button
                  variant="outline"
                  onClick={handleVerify}
                  disabled={verifySmtp.isPending || !form.smtpHost || !form.smtpUser || !form.smtpPass}
                  className="w-full"
                >
                  {verifySmtp.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />验证中...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" />验证 SMTP 连接</>
                  )}
                </Button>

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
              disabled={createAccount.isPending || !selectedProvider || !form.email}
            >
              {createAccount.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />添加中...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" />添加邮箱</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
