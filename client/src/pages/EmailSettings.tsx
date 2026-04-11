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
import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Mail, Plus, Trash2, Star, CheckCircle2, ArrowLeft, Shield, Settings, Eye, EyeOff, PenLine, Type, ImageIcon, X } from "lucide-react";
import {
    Dialog
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
    snovio: { name: "Snov.io", icon: "ð", desc: "Snov.io é®ä»¶è¥éå¹³å°" },
    gmail: { name: "Gmail", icon: "ð§", desc: "Google Gmail (éå¼å¯åºç¨ä¸ç¨å¯ç )" },
    outlook: { name: "Outlook", icon: "ð¬", desc: "Microsoft Outlook / Hotmail" },
    qq: { name: "QQ é®ç®±", icon: "ð®", desc: "QQ é®ç®± (éå¼å¯ SMTP æå¡)" },
    "163": { name: "ç½æ 163", icon: "ð¨", desc: "ç½æ 163 é®ç®±" },
    yahoo: { name: "Yahoo", icon: "ð©", desc: "Yahoo Mail" },
    zoho: { name: "Zoho", icon: "âï¸", desc: "Zoho Mail" },
    sendgrid: { name: "SendGrid", icon: "ð", desc: "SendGrid é®ä»¶æå¡" },
    mailgun: { name: "Mailgun", icon: "ð«", desc: "Mailgun é®ä»¶æå¡" },
    custom: { name: "èªå®ä¹ SMTP", icon: "âï¸", desc: "æå¨éç½® SMTP/IMAP æå¡å¨" },
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

  // Email signature and formatting state
  const [signature, setSignature] = useState('');
    const [fontSize, setFontSize] = useState(14);
    const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
    const [signatureLogoUrl, setSignatureLogoUrl] = useState<string | null>(null);
    const [signatureSaving, setSignatureSaving] = useState(false);

  const emailSettings = trpc.profile.getEmailSettings.useQuery(undefined, {
        onSuccess: (data: any) => {
                if (data) {
                          setSignature(data.signature || '');
                          setFontSize(data.fontSize || 14);
                          setFontFamily(data.fontFamily || 'Arial, sans-serif');
                          setSignatureLogoUrl(data.signatureLogoUrl || null);
                }
        },
  });

  const updateEmailSettingsMutation = trpc.profile.updateEmailSettings.useMutation({
        onSuccess: () => {
                toast.success('é®ä»¶æ ¼å¼è®¾ç½®å·²ä¿å­');
                setSignatureSaving(false);
        },
        onError: (err: any) => {
                toast.error('ä¿å­å¤±è´¥: ' + err.message);
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
                toast.error("è¯·å¡«åå®æ´ç SMTP ä¿¡æ¯");
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
                          toast.success("SMTP è¿æ¥éªè¯æåï¼");
                } else {
                          toast.error("SMTP è¿æ¥å¤±è´¥: " + (result.error || "æªç¥éè¯¯"));
                }
        } catch (e: any) {
                toast.error("éªè¯å¤±è´¥: " + (e.message || "æªç¥éè¯¯"));
        }
  };

  const handleCreate = async () => {
        if (!form.email || !selectedProvider) {
                toast.error("è¯·å¡«åé®ç®±å°åå¹¶éæ©é®ç®±ç±»å");
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
                toast.success("é®ç®±è´¦æ·æ·»å æåï¼");
                setShowAdd(false);
                resetForm();
                utils.emailAccounts.list.invalidate();
        } catch (e: any) {
                toast.error("æ·»å å¤±è´¥: " + (e.message || "æªç¥éè¯¯"));
        }
  };

  const handleDelete = async (accountId: number) => {
        try {
                await deleteAccount.mutateAsync({ accountId });
                toast.success("é®ç®±è´¦æ·å·²å é¤");
                utils.emailAccounts.list.invalidate();
        } catch (e: any) {
                toast.error("å é¤å¤±è´¥: " + (e.message || "æªç¥éè¯¯"));
        }
  };

  const handleSetDefault = async (accountId: number) => {
        try {
                await setDefault.mutateAsync({ accountId });
                toast.success("å·²è®¾ä¸ºé»è®¤åä»¶é®ç®±");
                utils.emailAccounts.list.invalidate();
        } catch (e: any) {
                toast.error("è®¾ç½®å¤±è´¥: " + (e.message || "æªç¥éè¯¯"));
        }
  };

  const resetForm = () => {
        setSelectedProvider("");
        setForm({
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
                                              é®ç®±è®¾ç½®
                                  </h1>
                                  <p className="text-muted-foreground mt-1">
                                              éç½®åä»¶é®ç®±ï¼SMTP åé + IMAP æ¶ä¿¡æ£æµï¼ï¼æ¯æ Snov.ioãGmailãOutlookãQQé®ç®±ç­
                                  </p>
                        </div>
                </div>
          
            {/* Help Card */}
                <Card className="border-blue-500/20 bg-blue-500/5">
                        <CardContent className="py-4">
                                  <div className="flex items-start gap-3">
                                              <Shield className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                                              <div className="text-sm space-y-1">
                                                            <p className="font-medium">å®å¨æç¤º</p>
                                                            <p className="text-muted-foreground">
                                                                            ææé®ç®±å¯ç åå å¯å­å¨ãå»ºè®®ä½¿ç¨<strong>åºç¨ä¸ç¨å¯ç </strong>èéç»å½å¯ç ã
                                                                            ç³»ç»ä¼éè¿ SMTP åéé®ä»¶ï¼éè¿ IMAP èªå¨æ£æµå®¢æ·åä¿¡ã
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
                                              é®ä»¶æ ¼å¼è®¾ç½®
                                  </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                                  <div className="space-y-2">
                                              <Label className="flex items-center gap-1.5 text-sm font-medium">
                                                            <Type className="h-4 w-4" />
                                                            é®ä»¶ç­¾å
                                              </Label>
                                              <Textarea
                                                              placeholder={"å¨æ­¤è¾å¥æ¨çé®ä»¶ç­¾åï¼ä¾å¦ï¼\n\nç¥å¥½ï¼\nå¼ ä¸ | éå®æ»ç\nexample@company.com"}
                                                              value={signature}
                                                              onChange={(e) => setSignature(e.target.value)}
                                                              rows={5}
                                                              className="resize-y text-sm"
                                                            />
                                              <p className="text-xs text-muted-foreground">ç­¾åå°èªå¨éå å¨æ¯å°ååºçé®ä»¶æ«å°¾</p>
                                  </div>
                        
                                  <div className="space-y-2">
                                              <Label className="flex items-center gap-1.5 text-sm font-medium">
                                                            <ImageIcon className="h-4 w-4" />
                                                            ç­¾å Logoï¼å¯éï¼
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
                                              ä¸ä¼ å¾çï¼PNG / JPG / SVGï¼å»ºè®®é«åº¦ 40-60pxï¼
                                              <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    className="hidden"
                                                                    onChange={(e) => {
                                                                                            const file = e.target.files?.[0];
                                                                                            if (!file) return;
                                                                                            if (file.size > 2 * 1024 * 1024) {
                                                                                                                      toast.error("å¾çå¤§å°ä¸è½è¶è¿ 2MB");
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
                                              <p className="text-xs text-muted-foreground">Logo å°æ¾ç¤ºå¨ç­¾åæå­ä¸æ¹ï¼ä»¥ base64 åµå¥é®ä»¶</p>
                                  </div>
                        
                                  <Separator />
                        
                                  <div className="grid grid-cols-2 gap-4">
                                              <div className="space-y-2">
                                                            <Label className="text-sm font-medium">å­å·</Label>
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
                                                            <Label className="text-sm font-medium">å­ä½</Label>
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
                                              <Label className="text-sm font-medium">é¢è§ææ</Label>
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
                                                                              <p className="text-muted-foreground text-sm italic">ï¼ææ ç­¾åï¼</p>
                                                            )}
                                              </div>
                                  </div>
                        
                                  <Button onClick={handleSaveSignature} disabled={signatureSaving}>
                                    {signatureSaving ? (
                          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />ä¿å­ä¸­...</span>
                        ) : 'ä¿å­æ ¼å¼è®¾ç½®'}
                                  </Button>
                        </CardContent>
                </Card>
          
            {/* Account List */}
                <div className="space-y-3">
                        <div className="flex items-center justify-between">
                                  <h2 className="text-lg font-semibold">å·²éç½®çé®ç®± ({accounts?.length || 0})</h2>
                                  <Button onClick={() => { resetForm(); setShowAdd(true); }}>
                                              <Plus className="h-4 w-4 mr-2" />
                                              æ·»å é®ç®±
                                  </Button>
                        </div>
                
                  {(!accounts || accounts.length === 0) ? (
                      <Card className="border-dashed">
                                  <CardContent className="py-12 text-center">
                                                <Mail className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                                                <p className="text-muted-foreground">å°æªéç½®ä»»ä½åä»¶é®ç®±</p>
                                                <p className="text-sm text-muted-foreground/60 mt-1">
                                                                æ·»å é®ç®±åå³å¯åéé®ä»¶å¹¶èªå¨æ£æµå®¢æ·åä¿¡
                                                </p>
                                                <Button className="mt-4" onClick={() => { resetForm(); setShowAdd(true); }}>
                                                                <Plus className="h-4 w-4 mr-2" />
                                                                æ·»å ç¬¬ä¸ä¸ªé®ç®±
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
                                                                                                          {PROVIDER_INFO[account.provider]?.icon || "ð§"}
                                                                                                          </div>
                                                                                                        <div className="min-w-0">
                                                                                                                              <div className="flex items-center gap-2">
                                                                                                                                                      <p className="text-sm font-medium truncate">{account.label}</p>
                                                                                                                                {account.isDefault && (
                                                                <Badge variant="outline" className="text-xs text-primary border-primary/30">
                                                                                            <Star className="h-3 w-3 mr-1 fill-current" />é»è®¤
                                                                </Badge>
                                                                                                                                                      )}
                                                                                                                                                      <Badge variant="secondary" className="text-[10px]">
                                                                                                                                                        {PROVIDER_INFO[account.provider]?.name || account.provider}
                                                                                                                                                        </Badge>
                                                                                                                                </div>
                                                                                                                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                                                                                                {account.email}
                                                                                                                                {account.imapHost && <span className="ml-2 text-green-500">IMAP å·²éç½®</span>}
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
                                                                                    <Star className="h-3 w-3 mr-1" />è®¾ä¸ºé»è®¤
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
                                              <DialogTitle>æ·»å åä»¶é®ç®±</DialogTitle>
                                              <DialogDescription>
                                                            éæ©é®ç®±ç±»åï¼ç³»ç»ä¼èªå¨å¡«å SMTP å IMAP è®¾ç½®
                                              </DialogDescription>
                                  </DialogHeader>
                        
                                  <div className="space-y-4">
                                    {/* Provider Selection */}
                                              <div className="space-y-2">
                                                            <Label>é®ç®±ç±»å</Label>
                                                            <Select value={selectedProvider} onValueChange={handleSelectProvider}>
                                                                            <SelectTrigger>
                                                                                              <SelectValue placeholder="éæ©é®ç®±ç±»å..." />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                              <SelectItem value="snovio">ð Snov.ioï¼æ¨èï¼</SelectItem>
                                                                                              <SelectItem value="gmail">ð§ Gmail</SelectItem>
                                                                                              <SelectItem value="outlook">ð¬ Outlook / Hotmail</SelectItem>
                                                                                              <SelectItem value="qq">ð® QQ é®ç®±</SelectItem>
                                                                                              <SelectItem value="163">ð¨ ç½æ 163</SelectItem>
                                                                                              <SelectItem value="yahoo">ð© Yahoo Mail</SelectItem>
                                                                                              <SelectItem value="zoho">âï¸ Zoho Mail</SelectItem>
                                                                                              <SelectItem value="sendgrid">ð SendGrid</SelectItem>
                                                                                              <SelectItem value="mailgun">ð« Mailgun</SelectItem>
                                                                                              <SelectItem value="custom">âï¸ èªå®ä¹ SMTP</SelectItem>
                                                                            </SelectContent>
                                                            </Select>
                                              </div>
                                  
                                    {selectedProvider && (
                          <>
                            {/* Provider-specific hints */}
                            {selectedProvider === "snovio" && (
                                              <Card className="border-blue-500/20 bg-blue-500/5">
                                                                  <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
                                                                                        <p className="font-medium text-foreground">Snov.io éç½®è¯´æ</p>
                                                                                        <p>ä½¿ç¨ Snov.io ç SMTP ä¸­ç»§æå¡åéé®ä»¶ï¼IMAP æ¥æ¶åä¿¡ã</p>
                                                                                        <p>SMTP/IMAP ç¨æ·åå¡«åä½ ç Snov.io ç»å½é®ç®±ï¼å¯ç å¡«å Snov.io è´¦å·å¯ç ã</p>
                                                                  </CardContent>
                                              </Card>
                                          )}
                            {selectedProvider === "gmail" && (
                                              <Card className="border-amber-500/20 bg-amber-500/5">
                                                                  <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
                                                                                        <p className="font-medium text-foreground">Gmail éç½®è¯´æ</p>
                                                                                        <p>1. åå¾ Google è´¦å· â å®å¨æ§ â ä¸¤æ­¥éªè¯ï¼å¿é¡»å¼å¯ï¼</p>
                                                                                        <p>2. æç´¢"åºç¨ä¸ç¨å¯ç "ï¼çæä¸ä¸ªæ°å¯ç </p>
                                                                                        <p>3. å°çæç16ä½å¯ç å¡«å¥ä¸æ¹ SMTP å¯ç å­æ®µ</p>
                                                                  </CardContent>
                                              </Card>
                                          )}
                            {selectedProvider === "qq" && (
                                              <Card className="border-amber-500/20 bg-amber-500/5">
                                                                  <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
                                                                                        <p className="font-medium text-foreground">QQ é®ç®±éç½®è¯´æ</p>
                                                                                        <p>1. ç»å½ QQ é®ç®± â è®¾ç½® â è´¦æ· â POP3/SMTP æå¡ï¼å¼å¯ï¼</p>
                                                                                        <p>2. ææç¤ºåéç­ä¿¡è·åææç </p>
                                                                                        <p>3. å°ææç å¡«å¥ä¸æ¹ SMTP å¯ç å­æ®µ</p>
                                                                  </CardContent>
                                              </Card>
                                          )}
                          
                                          <Separator />
                          
                            {/* Common Fields */}
                                          <div className="grid grid-cols-2 gap-3">
                                                            <div className="space-y-1.5">
                                                                                <Label className="text-xs">æ¾ç¤ºåç§°</Label>
                                                                                <Input
                                                                                                        value={form.label}
                                                                                                        onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
                                                                                                        placeholder="å¦ï¼æç Gmail"
                                                                                                      />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                                <Label className="text-xs">åä»¶é®ç®±å°å</Label>
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
                                                            <p className="text-sm font-medium">SMTP åéè®¾ç½®</p>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                                <div className="space-y-1.5">
                                                                                                      <Label className="text-xs">SMTP æå¡å¨</Label>
                                                                                                      <Input
                                                                                                                                value={form.smtpHost}
                                                                                                                                onChange={e => setForm(prev => ({ ...prev, smtpHost: e.target.value }))}
                                                                                                                                placeholder="smtp.example.com"
                                                                                                                                disabled={selectedProvider !== "custom"}
                                                                                                                              />
                                                                                  </div>
                                                                                <div className="space-y-1.5">
                                                                                                      <Label className="text-xs">ç«¯å£</Label>
                                                                                                      <Input
                                                                                                                                type="number"
                                                                                                                                value={form.smtpPort}
                                                                                                                                onChange={e => setForm(prev => ({ ...prev, smtpPort: parseInt(e.target.value) || 587 }))}
                                                                                                                                disabled={selectedProvider !== "custom"}
                                                                                                                              />
                                                                                  </div>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                                <Label className="text-xs">SMTP ç¨æ·åï¼éå¸¸æ¯é®ç®±å°åï¼</Label>
                                                                                <Input
                                                                                                        value={form.smtpUser}
                                                                                                        onChange={e => setForm(prev => ({ ...prev, smtpUser: e.target.value }))}
                                                                                                        placeholder="your@email.com"
                                                                                                      />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                                <Label className="text-xs">SMTP å¯ç  / ææç </Label>
                                                                                <div className="relative">
                                                                                                      <Input
                                                                                                                                type={showPassword ? "text" : "password"}
                                                                                                                                value={form.smtpPass}
                                                                                                                                onChange={e => setForm(prev => ({ ...prev, smtpPass: e.target.value }))}
                                                                                                                                placeholder="åºç¨ä¸ç¨å¯ç æææç "
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
                                                                                <Label className="text-xs">ä½¿ç¨ TLS/SSL å å¯</Label>
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
                                                                                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin mr-2" /> éªè¯ä¸­...</span>
                                                                                ) : (
                                                                                  <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 mr-2" /> éªè¯ SMTP è¿æ¥</span>
                                                            )}
                                          </Button>
                          
                            {/* IMAP Fields (Collapsible) */}
                                          <Accordion type="single" collapsible defaultValue={selectedProvider === "custom" ? "imap" : undefined}>
                                                            <AccordionItem value="imap" className="border rounded-lg px-3">
                                                                                <AccordionTrigger className="text-sm font-medium py-3">
                                                                                                      IMAP æ¶ä¿¡è®¾ç½®ï¼ç¨äºèªå¨æ£æµå®¢æ·åä¿¡ï¼
                                                                                  </AccordionTrigger>
                                                                                <AccordionContent className="space-y-3 pb-4">
                                                                                                      <p className="text-xs text-muted-foreground">
                                                                                                        {selectedProvider !== "custom"
                                                                                                                                    ? "IMAP è®¾ç½®å·²æ ¹æ®é®ç®±ç±»åèªå¨å¡«åãå¦éä¿®æ¹è¯·åæ¢å°ãèªå®ä¹ SMTPãã"
                                                                                                                                    : "è¯·æå¨å¡«å IMAP æå¡å¨ä¿¡æ¯ï¼ç¨äºèªå¨æ£æµå®¢æ·åä¿¡ã"}
                                                                                                        </p>
                                                                                                      <div className="grid grid-cols-2 gap-3">
                                                                                                                              <div className="space-y-1.5">
                                                                                                                                                        <Label className="text-xs">IMAP æå¡å¨</Label>
                                                                                                                                                        <Input
                                                                                                                                                                                      value={form.imapHost}
                                                                                                                                                                                      onChange={e => setForm(prev => ({ ...prev, imapHost: e.target.value }))}
                                                                                                                                                                                      placeholder="imap.example.com"
                                                                                                                                                                                      disabled={selectedProvider !== "custom"}
                                                                                                                                                                                    />
                                                                                                                                </div>
                                                                                                                              <div className="space-y-1.5">
                                                                                                                                                        <Label className="text-xs">ç«¯å£</Label>
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
                                                                                                                              <Label className="text-xs">ä½¿ç¨ TLS/SSL å å¯</Label>
                                                                                                        </div>
                                                                                                      <p className="text-[10px] text-muted-foreground/60">
                                                                                                                              IMAP ä½¿ç¨ä¸ SMTP ç¸åçç¨æ·ååå¯ç è¿è¡è®¤è¯
                                                                                                        </p>
                                                                                  </AccordionContent>
                                                            </AccordionItem>
                                          </Accordion>
                          
                            {/* Snov.io specific fields */}
                            {selectedProvider === "snovio" && (
                                              <div className="space-y-3">
                                                                  <p className="text-sm font-medium">Snov.io API å­è¯ï¼å¯éï¼ç¨äºæ°æ®ä¸°å¯ï¼</p>
                                                                  <div className="grid grid-cols-2 gap-3">
                                                                                        <div className="space-y-1.5">
                                                                                                                <Label className="text-xs">Client ID</Label>
                                                                                                                <Input
                                                                                                                                            value={form.snovioClientId}
                                                                                                                                            onChange={e => setForm(prev => ({ ...prev, snovioClientId: e.target.value }))}
                                                                                                                                            placeholder="å¯é"
                                                                                                                                          />
                                                                                          </div>
                                                                                        <div className="space-y-1.5">
                                                                                                                <Label className="text-xs">Client Secret</Label>
                                                                                                                <Input
                                                                                                                                            type="password"
                                                                                                                                            value={form.snovioClientSecret}
                                                                                                                                            onChange={e => setForm(prev => ({ ...prev, snovioClientSecret: e.target.value }))}
                                                                                                                                            placeholder="å¯é"
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
                                                            <Label className="text-xs">è®¾ä¸ºé»è®¤åä»¶é®ç®±</Label>
                                          </div>
                          </>
                        )}
                                  </div>
                        
                                  <DialogFooter>
                                              <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>åæ¶</Button>
                                              <Button
                                                              onClick={handleCreate}
                                                              disabled={createAccount.isPending || !selectedProvider || !form.email}
                                                            >
                                                {createAccount.isPending ? (
                                                                              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin mr-2" /> æ·»å ä¸­...</span>
                                                                            ) : (
                                                                              <span className="flex items-center gap-2"><Plus className="h-4 w-4 mr-2" /> æ·»å é®ç®±</span>
                                                            )}
                                              </Button>
                                  </DialogFooter>
                        </DialogContent>
                </Dialog>
          </div>
        );
}
