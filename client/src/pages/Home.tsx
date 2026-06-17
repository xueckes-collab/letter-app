import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Globe, Mail, User, Upload, ArrowRight, Loader2, Users, FileText,
  Zap, Bell, Clock, Send, CheckCircle2, X, TableIcon
} from "lucide-react";
import * as XLSX from "xlsx";

// 列标题关键词映射
const EMAIL_KEYWORDS = ["email", "e-mail", "邮箱", "邮件", "mail", "电子邮件", "email address"];
const WEBSITE_KEYWORDS = ["website", "site", "url", "网站", "官网", "domain", "homepage", "web", "链接"];
const NAME_KEYWORDS = ["name", "contact", "联系人", "姓名", "名字", "person", "contact name", "first name", "full name"];

function detectColumnIndex(headers: string[], keywords: string[]): number {
  const normalized = headers.map(h => String(h).toLowerCase().trim());
  for (const kw of keywords) {
    const idx = normalized.findIndex(h => h.includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

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
      if (data.pipelineError) {
        toast.warning(`客户已创建，但深度背调入队失败`);
      } else {
        toast.success(`已加入深度背调队列：${data.lead?.companyName || data.lead?.website || data.lead?.email || '该客户'}`);
      }
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
                <span className="flex items-center gap-2"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加入队列...</span>
            ) : (
              <>加入深度背调队列 <ArrowRight className="ml-2 h-4 w-4" /></>
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
  const [isDragging, setIsDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; rowCount: number } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const bulkImport = trpc.leads.bulkImport.useMutation({
    onSuccess: (data) => {
      toast.success(`批量导入完成：成功 ${data.successCount} 条，失败 ${data.failedCount} 条${data.generatedCount ? `，已加入队列 ${data.generatedCount} 条` : ''}`);
      setBulkText('');
      setFileInfo(null);
      utils.leads.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const parseFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('仅支持 .xlsx、.xls、.csv 格式的文件');
      return;
    }
    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        let workbook: XLSX.WorkBook;
        if (ext === 'csv') {
          const text = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          workbook = XLSX.read(data, { type: 'array' });
        }
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rows.length < 2) {
          toast.error('表格内容为空，请检查文件');
          setIsParsing(false);
          return;
        }

        const headers = rows[0].map((h: any) => String(h));
        const emailIdx = detectColumnIndex(headers, EMAIL_KEYWORDS);
        const websiteIdx = detectColumnIndex(headers, WEBSITE_KEYWORDS);
        const nameIdx = detectColumnIndex(headers, NAME_KEYWORDS);

        if (emailIdx === -1 && websiteIdx === -1) {
          toast.error('未能识别邮箱或网站列，请确认表头包含 email/website 等关键词');
          setIsParsing(false);
          return;
        }

        const lines: string[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const email = emailIdx >= 0 ? String(row[emailIdx] || '').trim() : '';
          const website = websiteIdx >= 0 ? String(row[websiteIdx] || '').trim() : '';
          const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
          if (!email && !website) continue;
          lines.push([email, website, name].filter(Boolean).join(', '));
        }

        if (lines.length === 0) {
          toast.error('未解析到有效数据，请检查表格内容');
          setIsParsing(false);
          return;
        }

        setBulkText(lines.join('\n'));
        setFileInfo({ name: file.name, rowCount: lines.length });
        toast.success(`已解析 ${lines.length} 条客户数据（识别列：${[emailIdx >= 0 && headers[emailIdx], websiteIdx >= 0 && headers[websiteIdx], nameIdx >= 0 && headers[nameIdx]].filter(Boolean).join('、')}）`);
      } catch (err) {
        toast.error('文件解析失败，请检查格式是否正确');
      } finally {
        setIsParsing(false);
      }
    };
    if (ext === 'csv') {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }, [parseFile]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          批量导入
        </CardTitle>
        <CardDescription>上传 Excel/CSV 文件，AI 自动识别列并读取客户数据</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!bulkText.trim()) { toast.error('请输入或上传导入数据'); return; }
            bulkImport.mutate({ rows: bulkText, autoGenerate: true });
          }}
          className="space-y-4"
        >
          {/* 文件上传区域 */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {isParsing ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">正在解析文件...</p>
              </div>
            ) : fileInfo ? (
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <TableIcon className="h-5 w-5 text-emerald-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">{fileInfo.name}</p>
                    <p className="text-xs text-muted-foreground">已解析 {fileInfo.rowCount} 条客户数据</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); setFileInfo(null); setBulkText(''); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <FileText className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">点击或拖拽上传 Excel / CSV</p>
                  <p className="text-xs text-muted-foreground mt-0.5">支持 .xlsx · .xls · .csv，自动识别邮箱、网站、联系人列</p>
                </div>
              </div>
            )}
          </div>

          {/* 分隔线 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">或手动输入</span>
            </div>
          </div>

          {/* 手动文本框 */}
          <Textarea
            placeholder={"buyer@example.com, https://example.com, John Smith\nanother@company.com, https://company.com"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground -mt-2">每行一条：邮箱, 网站, 联系人名（可选）</p>

          <Button type="submit" variant="outline" disabled={bulkImport.isPending} className="w-full">
            {bulkImport.isPending ? (
              <span className="flex items-center gap-2"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 导入中...</span>
            ) : (
              <span className="flex items-center gap-2"><Upload className="mr-2 h-4 w-4" /> 批量导入客户</span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
