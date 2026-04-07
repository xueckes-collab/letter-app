import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Zap, Clock, Send, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, Mail, ArrowRight, Users, Timer, Inbox, Settings,
  BellRing, Shield, Activity, SlidersHorizontal
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function AutomationPage() {
  const [, setLocation] = useLocation();
  const { data: leads, isLoading: leadsLoading } = trpc.leads.list.useQuery();
  const { data: followUpDue, isLoading: followUpLoading, refetch: refetchFollowUp } = trpc.batch.getFollowUpDue.useQuery();
  const { data: emailAccounts } = trpc.emailAccounts.list.useQuery();
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery();
  const { data: autoSettings } = trpc.automation.getSettings.useQuery();

  const batchGenerate = trpc.batch.generateEmails.useMutation();
  const batchSend = trpc.batch.sendEmails.useMutation();
  const batchFollowUp = trpc.batch.generateFollowUps.useMutation();
  const updateSettings = trpc.automation.updateSettings.useMutation();
  const utils = trpc.useUtils();

  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showFollowUpConfirm, setShowFollowUpConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingDraftEmails, setPendingDraftEmails] = useState<Array<{
    emailId: number; leadId: number; to: string; subject: string; body: string;
    companyName: string | null; emailType: string;
  }>>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [batchProgress, setBatchProgress] = useState<{ type: string; total: number; done: number } | null>(null);

  // Derived lead groups
  const newLeads = leads?.filter(l => l.currentState === 'input_ready' || l.status === 'new') || [];
  const draftLeads = leads?.filter(l => l.status === 'email_drafted' || l.status === 'followup_drafted') || [];
  const sentLeads = leads?.filter(l => l.status === 'email_sent' || l.status === 'contacted') || [];
  const repliedLeads = leads?.filter(l => l.status === 'reply_received') || [];
  const followUpLeads = followUpDue || [];

  const defaultAccount = emailAccounts?.find(a => a.isDefault) || emailAccounts?.[0];

  const handleBatchGenerate = async () => {
    if (newLeads.length === 0) { toast.info("没有需要生成邮件的新客户"); return; }
    const leadIds = newLeads.map(l => l.id);
    setBatchProgress({ type: 'generate', total: leadIds.length, done: 0 });
    try {
      const result = await batchGenerate.mutateAsync({ leadIds });
      setBatchProgress(null);
      toast.success(`批量生成完成：${result.processed}/${result.total} 封邮件已生成`);
      utils.leads.list.invalidate();
    } catch (e: any) {
      setBatchProgress(null);
      toast.error("批量生成失败: " + (e.message || "Unknown error"));
    }
  };

  const handlePrepareSend = async () => {
    if (draftLeads.length === 0) { toast.info("没有待发送的邮件草稿"); return; }
    if (!emailAccounts || emailAccounts.length === 0) {
      toast.error("请先在「邮箱设置」中配置发件邮箱");
      setLocation("/email-settings");
      return;
    }
    const leadIds = draftLeads.map(l => l.id);
    try {
      const drafts = await utils.batch.getDraftEmails.fetch({ leadIds });
      if (!drafts || drafts.length === 0) { toast.info("没有找到待发送的邮件草稿"); return; }
      setPendingDraftEmails(drafts);
      if (defaultAccount) setSelectedAccountId(String(defaultAccount.id));
      setShowSendConfirm(true);
    } catch (e: any) {
      toast.error("加载草稿失败: " + (e.message || "Unknown error"));
    }
  };

  const handleConfirmSend = async () => {
    setShowSendConfirm(false);
    const emailIds = pendingDraftEmails.map(e => e.emailId);
    setBatchProgress({ type: 'send', total: emailIds.length, done: 0 });
    try {
      const result = await batchSend.mutateAsync({
        emailIds,
        accountId: selectedAccountId ? Number(selectedAccountId) : undefined,
      });
      setBatchProgress(null);
      toast.success(`批量发送完成：${result.sent}/${result.total} 封邮件已发送`);
      utils.leads.list.invalidate();
      utils.batch.getFollowUpDue.invalidate();
    } catch (e: any) {
      setBatchProgress(null);
      toast.error("批量发送失败: " + (e.message || "Unknown error"));
    }
  };

  const handleBatchFollowUp = () => {
    if (followUpLeads.length === 0) { toast.info("暂无需要跟进的客户"); return; }
    setShowFollowUpConfirm(true);
  };

  const handleConfirmFollowUp = async () => {
    setShowFollowUpConfirm(false);
    const leadIds = followUpLeads.map((l: any) => l.id);
    setBatchProgress({ type: 'followup', total: leadIds.length, done: 0 });
    try {
      const result = await batchFollowUp.mutateAsync({ leadIds });
      setBatchProgress(null);
      toast.success(`跟进邮件生成完成：${result.generated}/${result.total} 封`);
      utils.leads.list.invalidate();
      utils.batch.getFollowUpDue.invalidate();
    } catch (e: any) {
      setBatchProgress(null);
      toast.error("生成跟进邮件失败: " + (e.message || "Unknown error"));
    }
  };

  const handleUpdateSetting = async (key: string, value: any) => {
    try {
      await updateSettings.mutateAsync({ [key]: value });
      utils.automation.getSettings.invalidate();
      toast.success("设置已更新");
    } catch (e: any) {
      toast.error("更新失败: " + (e.message || "Unknown error"));
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            自动化中心
          </h1>
          <p className="text-muted-foreground mt-1">
            批量生成开发信、一键发送、自动跟进 — 让 AI 为你完成繁重工作
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            自动化设置
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation("/email-settings")}>
            <Settings className="h-4 w-4 mr-2" />
            邮箱设置
          </Button>
        </div>
      </div>

      {/* Automation Settings Panel */}
      {showSettings && autoSettings && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              自动化配置
            </CardTitle>
            <CardDescription>自定义跟进间隔、通知偏好和发送策略</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Follow-up timing */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">跟进策略</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">自动跟进间隔</Label>
                  <Select
                    value={String(autoSettings.followUpHours)}
                    onValueChange={(v) => handleUpdateSetting("followUpHours", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">24 小时</SelectItem>
                      <SelectItem value="48">48 小时（推荐）</SelectItem>
                      <SelectItem value="72">72 小时</SelectItem>
                      <SelectItem value="96">96 小时</SelectItem>
                      <SelectItem value="120">5 天</SelectItem>
                      <SelectItem value="168">7 天</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">发送邮件后多久未回复触发跟进</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">最大跟进轮数</Label>
                  <Select
                    value={String(autoSettings.maxFollowUpRounds)}
                    onValueChange={(v) => handleUpdateSetting("maxFollowUpRounds", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 5, 7, 9, 12, 15].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} 轮{n === 9 ? "（推荐）" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">达到最大轮数后停止自动跟进</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Toggles */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">自动化开关</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">自动跟进检测</Label>
                    <p className="text-[11px] text-muted-foreground">系统每30分钟检查是否有客户需要跟进</p>
                  </div>
                  <Switch
                    checked={autoSettings.autoFollowUpEnabled}
                    onCheckedChange={(v) => handleUpdateSetting("autoFollowUpEnabled", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">自动回信检测</Label>
                    <p className="text-[11px] text-muted-foreground">通过 IMAP 每15分钟检查收件箱中的客户回信</p>
                  </div>
                  <Switch
                    checked={autoSettings.replyCheckEnabled}
                    onCheckedChange={(v) => handleUpdateSetting("replyCheckEnabled", v)}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">自动发送跟进邮件</Label>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600">
                        {(autoSettings as any).autoSendFollowUp ? '已授权' : '需确认'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {(autoSettings as any).autoSendFollowUp
                        ? '⚡ 系统将在跟进到期时自动生成并发送邮件，无需人工确认'
                        : '🔔 跟进到期时系统自动生成草稿，需要您在此页面确认后发送'}
                    </p>
                  </div>
                  <Switch
                    checked={(autoSettings as any).autoSendFollowUp ?? false}
                    onCheckedChange={(v) => handleUpdateSetting("autoSendFollowUp", v)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Notification preferences */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">通知偏好</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">回信通知</Label>
                    <p className="text-[11px] text-muted-foreground">检测到客户回信时发送通知</p>
                  </div>
                  <Switch
                    checked={autoSettings.notifyOnReply}
                    onCheckedChange={(v) => handleUpdateSetting("notifyOnReply", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">跟进到期通知</Label>
                    <p className="text-[11px] text-muted-foreground">客户超时未回复时发送跟进提醒</p>
                  </div>
                  <Switch
                    checked={autoSettings.notifyOnFollowUpDue}
                    onCheckedChange={(v) => handleUpdateSetting("notifyOnFollowUpDue", v)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Send delay */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">发送策略</h4>
              <div className="space-y-2">
                <Label className="text-sm">批量发送间隔</Label>
                <Select
                  value={String(autoSettings.sendDelaySeconds)}
                  onValueChange={(v) => handleUpdateSetting("sendDelaySeconds", Number(v))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 秒</SelectItem>
                    <SelectItem value="5">5 秒（推荐）</SelectItem>
                    <SelectItem value="10">10 秒</SelectItem>
                    <SelectItem value="15">15 秒</SelectItem>
                    <SelectItem value="30">30 秒</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">每封邮件之间的发送间隔，防止被标记为垃圾邮件</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Status Panel */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium">系统运行中</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              <span>跟进检测：每30分钟 · 间隔 {autoSettings?.followUpHours || 48}h</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>回信检测：每15分钟</span>
            </div>
            {(unreadCount ?? 0) > 0 && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <BellRing className="h-3.5 w-3.5" />
                  <span>{unreadCount} 条未读通知</span>
                </div>
              </>
            )}
            {emailAccounts && emailAccounts.length > 0 && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span>发件邮箱：{defaultAccount?.email || emailAccounts[0].email}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Account Warning */}
      {(!emailAccounts || emailAccounts.length === 0) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">尚未配置发件邮箱</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  请先配置 SMTP 邮箱（支持 Snov.io、Gmail、Outlook、QQ邮箱等）才能发送邮件和启用自动回信检测
                </p>
              </div>
              <Button size="sm" onClick={() => setLocation("/email-settings")}>去配置</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Overlay */}
      {batchProgress && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {batchProgress.type === 'generate' && '正在批量生成开发信...'}
                  {batchProgress.type === 'send' && '正在批量发送邮件...'}
                  {batchProgress.type === 'followup' && '正在生成跟进邮件...'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  共 {batchProgress.total} 个客户，请耐心等待
                  {batchProgress.type === 'generate' && '（每个客户需要 AI 深度分析网站 + 生成个性化邮件）'}
                  {batchProgress.type === 'send' && `（邮件间隔 ${autoSettings?.sendDelaySeconds || 5} 秒防止被标记为垃圾邮件）`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "待生成", value: newLeads.length, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "待发送", value: draftLeads.length, icon: Mail, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "已发送", value: sentLeads.length, icon: Send, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "需跟进", value: followUpLeads.length, icon: Timer, color: "text-rose-500", bg: "bg-rose-500/10" },
          { label: "已回复", value: repliedLeads.length, icon: Inbox, color: "text-violet-500", bg: "bg-violet-500/10" },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold mt-0.5">{stat.value}</p>
                </div>
                <div className={`h-9 w-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1: Batch Generate */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <RefreshCw className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-base">第一步：批量生成</CardTitle>
                <CardDescription className="text-xs">AI 分析网站 + 生成个性化开发信</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {newLeads.length > 0 ? (
                <span>有 <strong className="text-foreground">{newLeads.length}</strong> 个新客户等待生成开发信</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  所有客户已生成开发信
                </span>
              )}
            </div>
            <Button
              onClick={handleBatchGenerate}
              disabled={newLeads.length === 0 || batchGenerate.isPending || !!batchProgress}
              className="w-full"
              variant={newLeads.length > 0 ? "default" : "outline"}
            >
              {batchGenerate.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />生成中...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />一键批量生成 ({newLeads.length})</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Step 2: Batch Send */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Send className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <CardTitle className="text-base">第二步：确认发送</CardTitle>
                <CardDescription className="text-xs">审核后通过邮箱一键发送</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {draftLeads.length > 0 ? (
                <span>有 <strong className="text-foreground">{draftLeads.length}</strong> 封邮件草稿待发送</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  没有待发送的草稿
                </span>
              )}
            </div>
            {defaultAccount && (
              <div className="text-xs text-muted-foreground/80 flex items-center gap-1">
                <Mail className="h-3 w-3" />
                发件邮箱: {defaultAccount.email}
              </div>
            )}
            <Button
              onClick={handlePrepareSend}
              disabled={draftLeads.length === 0 || batchSend.isPending || !!batchProgress}
              className="w-full"
              variant={draftLeads.length > 0 ? "default" : "outline"}
            >
              {batchSend.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />发送中...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />一键发送 ({draftLeads.length})</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Step 3: Auto Follow-up */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-rose-500" />
              </div>
              <div>
                <CardTitle className="text-base">第三步：自动跟进</CardTitle>
                <CardDescription className="text-xs">{autoSettings?.followUpHours || 48}h 无回复 → 系统自动提醒</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {followUpLeads.length > 0 ? (
                <span>有 <strong className="text-foreground">{followUpLeads.length}</strong> 个客户超过{autoSettings?.followUpHours || 48}小时未回复</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  暂无需要跟进的客户
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground/70 bg-accent/50 rounded px-2 py-1.5">
              系统每30分钟自动检测，到期后会通知你确认是否批量发送跟进信
            </div>
            <Button
              onClick={handleBatchFollowUp}
              disabled={followUpLeads.length === 0 || batchFollowUp.isPending || !!batchProgress}
              className="w-full"
              variant={followUpLeads.length > 0 ? "default" : "outline"}
            >
              {batchFollowUp.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />生成跟进信...</>
              ) : (
                <><Clock className="h-4 w-4 mr-2" />批量生成跟进信 ({followUpLeads.length})</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Workflow Explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">自动化工作流程</CardTitle>
          <CardDescription>系统自动管理邮件发送和跟进的完整流程</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            {[
              { icon: Users, label: "导入客户", desc: "批量导入邮箱和网站", color: "text-blue-500" },
              { icon: Zap, label: "AI 分析", desc: "网站分析 + ICP + USP", color: "text-violet-500" },
              { icon: Mail, label: "生成邮件", desc: "个性化开发信", color: "text-amber-500" },
              { icon: Send, label: "确认发送", desc: "审核后一键发送", color: "text-emerald-500" },
              { icon: Clock, label: "自动跟进", desc: `${autoSettings?.followUpHours || 48}h无回复自动提醒`, color: "text-rose-500" },
              { icon: Inbox, label: "回信检测", desc: "IMAP自动检测回信", color: "text-violet-500" },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3 flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div className={`h-10 w-10 rounded-lg bg-accent flex items-center justify-center`}>
                    <step.icon className={`h-5 w-5 ${step.color}`} />
                  </div>
                  <span className="text-xs font-medium">{step.label}</span>
                  <span className="text-[10px] text-muted-foreground">{step.desc}</span>
                </div>
                {i < 5 && <ArrowRight className="h-4 w-4 text-muted-foreground/40 hidden md:block" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Follow-up Due List */}
      {followUpLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500" />
              需要跟进的客户 ({followUpLeads.length})
            </CardTitle>
            <CardDescription>以下客户已超过{autoSettings?.followUpHours || 48}小时未回复，建议生成跟进邮件后一键发送</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {followUpLeads.map((lead: any) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => setLocation(`/leads/${lead.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                      <Timer className="h-4 w-4 text-rose-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{lead.companyName || lead.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className="text-rose-400 border-rose-500/30">
                      第 {(lead.leadState?.currentRound || 0) + 1} 轮跟进
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recently Replied Leads */}
      {repliedLeads.length > 0 && (
        <Card className="border-violet-500/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4 text-violet-500" />
              已收到回复 ({repliedLeads.length})
            </CardTitle>
            <CardDescription>以下客户已回复邮件，请及时查看并跟进</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {repliedLeads.slice(0, 10).map((lead: any) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-violet-500/5 hover:bg-violet-500/10 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/leads/${lead.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Inbox className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{lead.companyName || lead.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                    </div>
                  </div>
                  <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 shrink-0">
                    已回复
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Send Confirmation Dialog */}
      <Dialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>确认批量发送</DialogTitle>
            <DialogDescription>
              即将发送 {pendingDraftEmails.length} 封邮件。发送后系统将自动开始{autoSettings?.followUpHours || 48}小时跟进倒计时，并持续检测客户回信。
            </DialogDescription>
          </DialogHeader>

          {emailAccounts && emailAccounts.length > 1 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">选择发件邮箱</label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择发件邮箱" />
                </SelectTrigger>
                <SelectContent>
                  {emailAccounts.map(acc => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.label} ({acc.email})
                      {acc.isDefault && " ⭐"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-2 my-2">
            {pendingDraftEmails.map((e, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/50 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{e.companyName || e.to}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.to} · {e.subject}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {e.emailType === 'warm' ? '开发信' : e.emailType === 'followup' ? '跟进' : '回复'}
                </Badge>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendConfirm(false)}>取消</Button>
            <Button onClick={handleConfirmSend} className="bg-emerald-600 hover:bg-emerald-700">
              <Send className="h-4 w-4 mr-2" />
              确认发送 ({pendingDraftEmails.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up Confirmation Dialog */}
      <Dialog open={showFollowUpConfirm} onOpenChange={setShowFollowUpConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认批量生成跟进信</DialogTitle>
            <DialogDescription>
              将为 {followUpLeads.length} 个超过{autoSettings?.followUpHours || 48}小时未回复的客户生成跟进邮件。生成后需要再次确认才会发送。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-2 my-2">
            {followUpLeads.map((lead: any) => (
              <div key={lead.id} className="flex items-center justify-between p-2 rounded bg-accent/50 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-4 w-4 text-rose-500 shrink-0" />
                  <span className="truncate">{lead.companyName || lead.email}</span>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  第 {(lead.leadState?.currentRound || 0) + 1} 轮
                </Badge>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFollowUpConfirm(false)}>取消</Button>
            <Button onClick={handleConfirmFollowUp}>
              <Zap className="h-4 w-4 mr-2" />
              确认生成 ({followUpLeads.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
