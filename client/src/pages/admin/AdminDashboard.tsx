import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
Mail, Users, AlertTriangle, Clock, Zap, TrendingUp,
Loader2, RefreshCw, CheckCircle2, XCircle, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Stat card component ────────────────────────────────────────
function StatCard({
title, value, subtitle, icon: Icon, color, loading,
}: {
title: string; value: number | string; subtitle?: string;
icon: any; color: string; loading?: boolean;
}) {
return (
<Card className="relative overflow-hidden">
<CardContent className="p-5">
<div className="flex items-start justify-between">
<div>
<p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
{loading ? (
<div className="h-8 w-16 bg-muted animate-pulse rounded" />
) : (
<p className="text-2xl font-bold tracking-tight">{value}</p>
)}
{subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
</div>
<div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
<Icon className="h-5 w-5" />
</div>
</div>
</CardContent>
</Card>
);
}

// ─── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
const map: Record<string, { label: string; className: string }> = {
sent: { label: "已发送", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
draft: { label: "草稿", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
failed: { label: "失败", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
queued: { label: "队列中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
paused: { label: "已暂停", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
replied: { label: "已回复", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
};
const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
return (
<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.className}`}>
{cfg.label}
</span>
);
}

// ─── Main Dashboard ─────────────────────────────────────────────
export default function AdminDashboard() {
const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.admin.getDashboardStats.useQuery(undefined, { refetchInterval: 30000 });
const { data: failedEmails, isLoading: failedLoading, refetch: refetchFailed } = trpc.admin.getRecentFailedEmails.useQuery(undefined, { refetchInterval: 30000 });
const { data: healthData } = trpc.system.health.useQuery(undefined, { refetchInterval: 30000 });

const handleRefresh = () => { refetchStats(); refetchFailed(); };

return (
<div className="space-y-6 max-w-7xl">
{/* Page header */}
<div className="flex items-center justify-between">
<div>
<h1 className="text-xl font-semibold">仪表盘</h1>
<p className="text-sm text-muted-foreground mt-0.5">系统实时概览与异常监控</p>
</div>
<Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
<RefreshCw className="h-3.5 w-3.5" />
刷新
</Button>
</div>

{/* ── Stat cards ── */}
<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
<StatCard
title="今日发送量" icon={Mail}
value={stats?.sentToday ?? 0}
subtitle="今日已发出"
color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
loading={statsLoading}
/>
<StatCard
title="累计回复数" icon={TrendingUp}
value={stats?.repliedToday ?? 0}
subtitle="全部客户回复"
color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
loading={statsLoading}
/>
<StatCard
title="失败邮件数" icon={XCircle}
value={stats?.failedTotal ?? 0}
subtitle="发送失败待处理"
color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
loading={statsLoading}
/>
<StatCard
title="草稿待发送" icon={Clock}
value={stats?.draftTotal ?? 0}
subtitle="待用户发送"
color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
loading={statsLoading}
/>
<StatCard
title="7日活跃用户" icon={Users}
value={stats?.activeUsers ?? 0}
subtitle="最近7天有登录"
color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
loading={statsLoading}
/>
<StatCard
title="总用户数" icon={Users}
value={stats?.totalUsers ?? 0}
subtitle="全部注册用户"
color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
loading={statsLoading}
/>
<StatCard
title="总邮件序列" icon={FileText}
value={stats?.totalEmails ?? 0}
subtitle="全部邮件记录"
color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
loading={statsLoading}
/>
<StatCard
title="自动跟进触发" icon={Zap}
value={stats?.autoFollowUpCount ?? 0}
subtitle="调度器触发次数"
color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
loading={statsLoading}
/>
</div>

<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
{/* ── Recent failed emails ── */}
<Card>
<CardHeader className="pb-3">
<CardTitle className="text-sm flex items-center gap-2">
<AlertTriangle className="h-4 w-4 text-red-500" />
最近失败邮件
{(failedEmails?.length ?? 0) > 0 && (
<Badge variant="destructive" className="text-[10px] px-1.5">{failedEmails!.length}</Badge>
)}
</CardTitle>
</CardHeader>
<CardContent className="p-0">
{failedLoading ? (
<div className="flex items-center justify-center py-10">
<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
</div>
) : !failedEmails || failedEmails.length === 0 ? (
<div className="py-10 text-center">
<CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
<p className="text-sm text-muted-foreground">暂无失败邮件</p>
</div>
) : (
<div className="divide-y">
{failedEmails.map((email: any) => (
<div key={email.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
<div className="flex items-start justify-between gap-3">
<div className="min-w-0">
<p className="text-sm font-medium truncate">{email.subject || "(无标题)"}</p>
<p className="text-xs text-muted-foreground mt-0.5 truncate">
{email.leadEmail || "-"} · {email.leadCompany || "-"}
</p>
<p className="text-[10px] text-muted-foreground/60 mt-1">
操作人：{email.userName || "-"} · {email.createdAt ? new Date(email.createdAt).toLocaleString("zh-CN") : "-"}
</p>
</div>
<StatusBadge status={email.status} />
</div>
</div>
))}
</div>
)}
</CardContent>
</Card>

{/* ── System status summary ── */}
<Card>
<CardHeader className="pb-3">
<CardTitle className="text-sm flex items-center gap-2">
<CheckCircle2 className="h-4 w-4 text-emerald-500" />
系统状态
</CardTitle>
</CardHeader>
<CardContent className="space-y-3">
{[
{ label: "数据库连接", status: healthData?.database === "connected" ? "正常" : "异常", color: healthData?.database === "connected" ? "text-emerald-500" : "text-red-500" },
{ label: "系统健康", status: healthData?.ok ? "正常" : "异常", color: healthData?.ok ? "text-emerald-500" : "text-red-500" },
{ label: "邮件发送服务", status: (stats?.failedTotal ?? 0) > 10 ? "异常偏多" : "正常", color: (stats?.failedTotal ?? 0) > 10 ? "text-amber-500" : "text-emerald-500" },
{ label: "自动化调度器", status: (stats?.autoFollowUpCount ?? 0) > 0 ? "运行中" : "待触发", color: (stats?.autoFollowUpCount ?? 0) > 0 ? "text-emerald-500" : "text-slate-400" },
].map(({ label, status, color }) => (
<div key={label} className="flex items-center justify-between py-1">
<span className="text-sm text-muted-foreground">{label}</span>
<div className="flex items-center gap-1.5">
<span className={`h-2 w-2 rounded-full bg-current ${color}`} />
<span className={`text-xs font-medium ${color}`}>{status}</span>
</div>
</div>
))}

<div className="pt-3 border-t mt-3">
<p className="text-[10px] text-muted-foreground">
最后更新：{new Date().toLocaleString("zh-CN")}
</p>
</div>
</CardContent>
</Card>
</div>
</div>
);
}
