import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Mail, Loader2, RefreshCw, Pause, RotateCcw, Eye,
  ChevronLeft, ChevronRight, Inbox,
} from "lucide-react";
import { useState } from "react";

// ─── Status config ──────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft:   { label: "草稿",   className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  queued:  { label: "队列中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  sent:    { label: "已发送", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  failed:  { label: "失败",   className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  paused:  { label: "已暂停", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  replied: { label: "已回复", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
};

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "draft",   label: "草稿" },
  { key: "sent",    label: "已发送" },
  { key: "failed",  label: "失败" },
  { key: "queued",  label: "队列中" },
  { key: "paused",  label: "已暂停" },
];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ─── Email body dialog ──────────────────────────────────────────
function EmailBodyDialog({ email, onClose }: { email: any; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base pr-6">{email.subject || "(无标题)"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground py-2 border-y my-2">
          <span>收件人：<strong className="text-foreground">{email.leadEmail || "-"}</strong></span>
          <span>公司：<strong className="text-foreground">{email.leadCompany || "-"}</strong></span>
          <span>操作人：<strong className="text-foreground">{email.userName || "-"}</strong></span>
          <span>类型：<strong className="text-foreground">{email.emailType}</strong></span>
          <span>第 {email.stageNumber + 1} 轮</span>
          <StatusBadge status={email.status} />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {email.body ? (
            <div
              className="text-sm prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: email.body.replace(/\n/g, "<br/>") }}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">（邮件正文为空）</p>
          )}
        </div>
        <div className="pt-3 border-t text-[10px] text-muted-foreground">
          创建：{email.createdAt ? new Date(email.createdAt).toLocaleString("zh-CN") : "-"}
          {email.sentAt && ` · 发送：${new Date(email.sentAt).toLocaleString("zh-CN")}`}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main AdminEmails ───────────────────────────────────────────
const PAGE_SIZE = 20;

export default function AdminEmails() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);

  const { data, isLoading, refetch } = trpc.admin.listEmailTasks.useQuery(
    { status: statusFilter || undefined, page, limit: PAGE_SIZE },
    { keepPreviousData: true } as any,
  );

  const pause = trpc.admin.pauseEmailTask.useMutation({
    onSuccess: () => { toast.success("任务已暂停"); refetch(); },
    onError: e => toast.error("操作失败：" + e.message),
  });
  const resend = trpc.admin.resendEmailTask.useMutation({
    onSuccess: () => { toast.success("任务已重置为草稿，用户可重新发送"); refetch(); },
    onError: e => toast.error("操作失败：" + e.message),
  });

  const items = data?.items ?? [];
  const hasPrev = page > 1;
  const hasNext = items.length === PAGE_SIZE;

  const handleTabChange = (key: string) => {
    setStatusFilter(key);
    setPage(1);
  };

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">邮件任务</h1>
          <p className="text-sm text-muted-foreground mt-0.5">监控所有用户的邮件发送任务</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />刷新
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1.5 flex-wrap border-b pb-3">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              statusFilter === tab.key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Inbox className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">暂无邮件任务</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[2.5fr_1.5fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 px-4 py-2.5 border-b bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                <span>邮件标题</span>
                <span>目标客户</span>
                <span>操作用户</span>
                <span>类型</span>
                <span>状态</span>
                <span>时间</span>
                <span />
              </div>
              {/* Rows */}
              <div className="divide-y">
                {items.map((email: any) => (
                  <div
                    key={email.id}
                    className="grid grid-cols-[2.5fr_1.5fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                  >
                    {/* Subject */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{email.subject || "(无标题)"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">ID #{email.id} · 第 {email.stageNumber + 1} 轮</p>
                    </div>

                    {/* Lead */}
                    <div className="min-w-0">
                      <p className="text-xs truncate">{email.leadEmail || "-"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{email.leadCompany || "-"}</p>
                    </div>

                    {/* User */}
                    <span className="text-xs text-muted-foreground truncate">{email.userName || email.userEmail || "-"}</span>

                    {/* Type */}
                    <span className="text-xs text-muted-foreground">{email.emailType}</span>

                    {/* Status */}
                    <StatusBadge status={email.status} />

                    {/* Time */}
                    <span className="text-[10px] text-muted-foreground">
                      {email.sentAt
                        ? new Date(email.sentAt).toLocaleDateString("zh-CN")
                        : new Date(email.createdAt).toLocaleDateString("zh-CN")}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setSelectedEmail(email)}
                        title="查看正文"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {!["paused", "failed"].includes(email.status) && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700"
                          onClick={() => pause.mutate({ emailId: email.id })}
                          disabled={pause.isPending}
                          title="暂停任务"
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {["failed", "paused"].includes(email.status) && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                          onClick={() => resend.mutate({ emailId: email.id })}
                          disabled={resend.isPending}
                          title="重置为草稿"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-xs text-muted-foreground">第 {page} 页</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />上一页
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setPage(p => p + 1)}>
              下一页<ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Email body dialog */}
      {selectedEmail && (
        <EmailBodyDialog email={selectedEmail} onClose={() => setSelectedEmail(null)} />
      )}
    </div>
  );
}
