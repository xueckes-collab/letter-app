import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
ClipboardList, Shield, LogIn, Mail, Eye, Filter,
RefreshCw, Info, AlertCircle, Loader2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";

type AuditEntry = {
id: number;
ts: Date;
operator: string;
operatorRole: "admin" | "user" | "system";
action: string;
target: string;
detail: string;
category: "admin" | "login" | "email";
result: "success" | "fail" | "warn";
};

function ResultBadge({ result }: { result: string }) {
const map = {
success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
fail: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
warn: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};
const labels = { success: "成功", fail: "失败", warn: "警告" };
return (
<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${map[result as keyof typeof map] ?? "bg-muted text-muted-foreground"}`}>
{labels[result as keyof typeof labels] ?? result}
</span>
);
}

function RoleBadge({ role }: { role: string }) {
const map = {
admin: "bg-primary/10 text-primary border-primary/20",
user: "bg-muted text-muted-foreground",
system: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};
const labels = { admin: "管理员", user: "用户", system: "系统" };
return (
<span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] ${map[role as keyof typeof map] ?? "bg-muted text-muted-foreground"}`}>
{labels[role as keyof typeof labels] ?? role}
</span>
);
}
function DetailDialog({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
return (
<Dialog open onOpenChange={o => !o && onClose()}>
<DialogContent className="max-w-md">
<DialogHeader>
<DialogTitle className="flex items-center gap-2 text-base">
<Info className="h-4 w-4 text-primary" />
操作详情
</DialogTitle>
</DialogHeader>
<div className="space-y-2.5 text-sm mt-2">
{[
{ label: "操作时间", value: entry.ts.toLocaleString("zh-CN") },
{ label: "操作人", value: entry.operator },
{ label: "身份", value: <RoleBadge role={entry.operatorRole} /> },
{ label: "操作类型", value: entry.action },
{ label: "操作对象", value: entry.target },
{ label: "结果", value: <ResultBadge result={entry.result} /> },
].map(({ label, value }) => (
<div key={label} className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0">
<span className="text-muted-foreground shrink-0">{label}</span>
<span className="text-right">{value}</span>
</div>
))}
<div className="pt-1">
<p className="text-muted-foreground mb-1">详细描述</p>
<p className="text-sm bg-muted rounded-lg p-3">{entry.detail}</p>
</div>
</div>
</DialogContent>
</Dialog>
);
}

function LogTable({ entries }: { entries: AuditEntry[] }) {
const [selected, setSelected] = useState<AuditEntry | null>(null);

if (entries.length === 0) {
return (
<div className="flex flex-col items-center justify-center py-16 gap-3">
<ClipboardList className="h-10 w-10 text-muted-foreground/30" />
<p className="text-sm text-muted-foreground">暂无日志记录</p>
</div>
);
}

return (
<>
<div className="divide-y">
{entries.map(entry => (
<div key={`${entry.category}-${entry.id}`} className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors">
<div>
<p className="text-xs font-medium">{entry.action}</p>
<p className="text-[10px] text-muted-foreground mt-0.5">
{entry.ts.toLocaleString("zh-CN")}
</p>
</div>
<div className="min-w-0">
<p className="text-xs truncate">{entry.operator}</p>
<RoleBadge role={entry.operatorRole} />
</div>
<p className="text-xs text-muted-foreground truncate">{entry.target}</p>
<ResultBadge result={entry.result} />
<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(entry)}>
<Eye className="h-3.5 w-3.5" />
</Button>
</div>
))}
</div>
{selected && <DetailDialog entry={selected} onClose={() => setSelected(null)} />}
</>
);
}
export default function AdminAudit() {
const [activeTab, setActiveTab] = useState<"login" | "email">("login");
const [resultFilter, setResultFilter] = useState<"all" | "success" | "fail" | "warn">("all");

const {
data: authLogsData,
isLoading: authLogsLoading,
error: authLogsError,
refetch: refetchAuthLogs,
} = trpc.admin.listAuthLogs.useQuery({ limit: 200 }, { refetchInterval: 30000 });

const {
data: emailLogsData,
isLoading: emailLogsLoading,
error: emailLogsError,
refetch: refetchEmailLogs,
} = trpc.admin.listSentEmails.useQuery({ limit: 200 }, { refetchInterval: 30000 });

const loginEntries: AuditEntry[] = useMemo(() => {
if (!authLogsData) return [];
return authLogsData.map((log: any) => {
const isSuccess = log.eventType === "login_success" || log.eventType === "register_success";
const isRegister = log.eventType === "register_success" || log.eventType === "register_fail";
return {
id: log.id,
ts: new Date(log.createdAt),
operator: log.email,
operatorRole: "user" as const,
action: isRegister
? (isSuccess ? "用户注册" : "注册失败")
: (isSuccess ? "用户登录" : "登录失败"),
target: "Web",
detail: [
isRegister ? "注册" : "登录",
isSuccess ? "成功" : "失败",
log.errorMessage ? `，错误: ${log.errorMessage}` : "",
log.ipAddress ? `，IP: ${log.ipAddress}` : "",
].join(""),
category: "login" as const,
result: isSuccess ? ("success" as const) : ("fail" as const),
};
});
}, [authLogsData]);

const emailEntries: AuditEntry[] = useMemo(() => {
if (!emailLogsData) return [];
return emailLogsData.map((log: any) => ({
id: log.id,
ts: new Date(log.sentAt || log.createdAt),
operator: `User #${log.userId}`,
operatorRole: "user" as const,
action: "发送邮件",
target: log.leadEmail || `Lead #${log.leadId}`,
detail: [
`类型: ${log.emailType}`,
log.subject ? `，主题: ${log.subject}` : "",
log.leadCompany ? `，公司: ${log.leadCompany}` : "",
].join(""),
category: "email" as const,
result: "success" as const,
}));
}, [emailLogsData]);

const TABS = [
{ key: "login" as const, label: "登录日志", icon: LogIn, data: loginEntries, loading: authLogsLoading, error: authLogsError },
{ key: "email" as const, label: "邮件操作", icon: Mail, data: emailEntries, loading: emailLogsLoading, error: emailLogsError },
];

const currentTab = TABS.find(t => t.key === activeTab)!;
const currentData = useMemo(() => {
const base = currentTab.data;
return resultFilter === "all" ? base : base.filter(e => e.result === resultFilter);
}, [activeTab, resultFilter, currentTab.data]);

const failCount = currentTab.data.filter(e => e.result === "fail").length;

const handleRefresh = () => {
refetchAuthLogs();
refetchEmailLogs();
};

return (
<div className="space-y-5 max-w-6xl">
<div className="flex items-center justify-between">
<div>
<h1 className="text-xl font-semibold">审计日志</h1>
<p className="text-sm text-muted-foreground mt-0.5">
登录事件与关键邮件行为记录
</p>
</div>
<div className="flex items-center gap-2">
<Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh}>
<RefreshCw className="h-3.5 w-3.5" />刷新
</Button>
</div>
</div>

<div className="flex gap-2 border-b pb-3">
{TABS.map(({ key, label, icon: Icon, data }) => {
const fails = data.filter(e => e.result === "fail").length;
return (
<button
key={key}
onClick={() => { setActiveTab(key); setResultFilter("all"); }}
className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
activeTab === key
? "bg-primary text-primary-foreground border-primary"
: "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
}`}
>
<Icon className="h-3.5 w-3.5" />
{label}
<Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 ml-0.5">{data.length}</Badge>
{fails > 0 && (
<Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 ml-0.5">{fails}</Badge>
)}
</button>
);
})}
</div>

<div className="flex items-center gap-2">
<Filter className="h-3.5 w-3.5 text-muted-foreground" />
<div className="flex gap-1">
{(["all", "success", "fail", "warn"] as const).map(r => (
<button
key={r}
onClick={() => setResultFilter(r)}
className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
resultFilter === r
? "bg-primary text-primary-foreground border-primary"
: "border-border text-muted-foreground hover:border-primary/40"
}`}
>
{{ all: "全部", success: "成功", fail: "失败", warn: "警告" }[r]}
</button>
))}
</div>
<span className="text-xs text-muted-foreground ml-2">共 {currentData.length} 条</span>
</div>

<Card>
<CardContent className="p-0">
<div className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr_auto] gap-3 px-4 py-2.5 border-b bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
<span>操作 / 时间</span>
<span>操作人</span>
<span>操作对象</span>
<span>结果</span>
<span />
</div>

{currentTab.loading && (
<div className="flex flex-col items-center justify-center py-16 gap-3">
<Loader2 className="h-8 w-8 text-muted-foreground/30 animate-spin" />
<p className="text-sm text-muted-foreground">加载中...</p>
</div>
)}

{currentTab.error && !currentTab.loading && (
<div className="flex flex-col items-center justify-center py-16 gap-3">
<AlertCircle className="h-8 w-8 text-red-400" />
<p className="text-sm text-red-500">加载失败: {currentTab.error.message}</p>
<Button variant="outline" size="sm" onClick={handleRefresh}>重试</Button>
</div>
)}

{!currentTab.loading && !currentTab.error && (
<LogTable entries={currentData} />
)}
</CardContent>
</Card>
</div>
);
}
