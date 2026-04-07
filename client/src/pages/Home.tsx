import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Globe, Mail, User, Upload, ArrowRight, Loader2, Users, FileText,
  Zap, Bell, Clock, Send, CheckCircle2
} from "lucide-react";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const profile = trpc.profile.get.useQuery();
  const leadsList = trpc.leads.list.useQuery();
  const notifications = trpc.notifications.unreadCount.useQuery();

  const stats = useMemo(() => {
    const leads = leadsList.data || [];
    return {
      total: leads.length,
      new: leads.filter((l: any) => l.currentState === 'input_ready' || l.status === 'new').length,
      drafts: leads.filter((l: any) => l.currentState === 'waiting_user_send' || l.currentState === 'waiting_user_send_followup' || l.status === 'email_drafted' || l.status === 'followup_drafted').length,
      waiting: leads.filter((l: any) => l.currentState === 'waiting_response_status').length,
      replied: leads.filter((l: any) => l.replyStatus !== 'not_checked').length,
    };
  }, [leadsList.data]);

  // If no profile, redirect to onboarding
  if (profile.data === null && !profile.isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card className="border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <User className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">欢迎使用 Outbound Mail OS</CardTitle>
            <CardDescription>
              在开始之前，请先完成公司资料建档。AI 需要了解你的产品、优势和资质，才能写出精准的开发信。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setLocation('/profile')} size="lg">
              开始建档 <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">工作台</h1>
          <p className="text-muted-foreground mt-1">
            {user?.name ? `${user.name}，` : ''}管理你的销售外联流程
          </p>
        </div>
        {(notifications.data ?? 0) > 0 && (
          <Button variant="outline" size="sm" className="relative" onClick={() => setLocation('/automation')}>
            <Bell className="h-4 w-4 mr-2" />
            {notifications.data} 条通知
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setLocation('/leads')}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">总客户</p>
                <p className="text-2xl font-bold mt-1">{stats.total}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-blue-500/30 transition-colors" onClick={() => setLocation('/automation')}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">待生成</p>
                <p className="text-2xl font-bold mt-1">{stats.new}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">待发送</p>
                <p className="text-2xl font-bold mt-1">{stats.drafts}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">等待回复</p>
                <p className="text-2xl font-bold mt-1">{stats.waiting}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">已回复</p>
                <p className="text-2xl font-bold mt-1">{stats.replied}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickAddLead />
        <BulkImport />
      </div>

      {/* Automation CTA */}
      {(stats.new > 0 || stats.drafts > 0) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">自动化中心就绪</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.new > 0 && `${stats.new} 个客户待生成邮件`}
                    {stats.new > 0 && stats.drafts > 0 && ' · '}
                    {stats.drafts > 0 && `${stats.drafts} 封邮件待发送`}
                  </p>
                </div>
              </div>
              <Button onClick={() => setLocation('/automation')} size="sm">
                前往自动化 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuickAddLead() {
  const [form, setForm] = useState({ email: '', website: '', contactName: '' });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const createLead = trpc.leads.create.useMutation({
    onSuccess: (data) => {
      toast.success(`已完成 ${data.lead?.companyName || data.lead?.website} 的首封草稿`);
      utils.leads.list.invalidate();
      if (data.lead?.id) setLocation(`/leads/${data.lead.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          新增客户
        </CardTitle>
        <CardDescription>输入客户网站和邮箱，AI 会自动分析并生成首封开发信</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.email || !form.website) { toast.error('请填写邮箱和网站'); return; }
            createLead.mutate(form);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>客户邮箱</Label>
              <Input
                type="email"
                placeholder="buyer@company.com"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>客户网站</Label>
              <Input
                placeholder="https://company.com"
                value={form.website}
                onChange={(e) => setForm(prev => ({ ...prev, website: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>联系人姓名（可选）</Label>
            <Input
              placeholder="John Smith"
              value={form.contactName}
              onChange={(e) => setForm(prev => ({ ...prev, contactName: e.target.value }))}
            />
          </div>
          <Button type="submit" disabled={createLead.isPending} className="w-full">
            {createLead.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />AI 分析中...</>
            ) : (
              <>开始分析并生成邮件 <ArrowRight className="ml-2 h-4 w-4" /></>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function BulkImport() {
  const [bulkText, setBulkText] = useState('');
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const bulkImport = trpc.leads.bulkImport.useMutation({
    onSuccess: (data) => {
      toast.success(`批量导入完成：成功 ${data.successCount} 条，失败 ${data.failedCount} 条`);
      setBulkText('');
      utils.leads.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          批量导入
        </CardTitle>
        <CardDescription>每行一条记录，格式：邮箱, 网站, 联系人名（可选）。导入后可在自动化中心一键生成开发信。</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!bulkText.trim()) { toast.error('请输入导入数据'); return; }
            bulkImport.mutate({ rows: bulkText });
          }}
          className="space-y-4"
        >
          <Textarea
            placeholder={"buyer@example.com, https://example.com, John Smith\nanother@company.com, https://company.com"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={bulkImport.isPending} className="flex-1">
              {bulkImport.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />导入中...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />批量导入客户</>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
