import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import {
Globe, Mail, ArrowRight, Loader2, Building2, MapPin, Search, X,
FileEdit, Send, CheckCircle, MessageCircle, Clock, Trash2
} from "lucide-react";

const stateLabels: Record<string, string> = {
input_ready: '待处理',
waiting_user_send: '待发送',
waiting_user_send_followup: '待发送跟进',
waiting_response_status: '等待回复',
drafting_reply_email: '回复草稿',
};

const statusColorMap: Record<string, string> = {
slate: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
green: 'bg-green-500/10 text-green-400 border-green-500/20',
rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

// Email status display config
const emailStatusConfig: Record<string, { label: string; icon: typeof FileEdit; color: string }> = {
new: { label: '新客户', icon: Globe, color: 'text-slate-400' },
email_drafted: { label: '邮件已生成', icon: FileEdit, color: 'text-amber-400' },
followup_drafted: { label: '跟进已生成', icon: FileEdit, color: 'text-amber-400' },
email_sent: { label: '已发送', icon: Send, color: 'text-blue-400' },
contacted: { label: '已联系', icon: CheckCircle, color: 'text-emerald-400' },
reply_received: { label: '已回复', icon: MessageCircle, color: 'text-violet-400' },
followup_due: { label: '需跟进', icon: Clock, color: 'text-rose-400' },
};

const filterOptions = [
{ key: 'all', label: '全部' },
{ key: 'new', label: '新客户' },
{ key: 'drafted', label: '待发送' },
{ key: 'sent', label: '已发送' },
{ key: 'replied', label: '已回复' },
];

export default function LeadsPage() {
const [, setLocation] = useLocation();
const { data: leads, isLoading } = trpc.leads.list.useQuery(undefined, { refetchInterval: 30000 });
const [search, setSearch] = useState('');
const [statusFilter, setStatusFilter] = useState('all');
const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const utils = trpc.useUtils();
const deleteManyMutation = trpc.leads.deleteMany.useMutation({
onSuccess: () => {
utils.leads.list.invalidate();
setSelectedLeads(new Set());
setShowDeleteConfirm(false);
},
});

const filteredLeads = useMemo(() => {
if (!leads) return [];
let result = leads;
if (search.trim()) {
const q = search.toLowerCase();
result = result.filter((l: any) =>
(l.companyName || '').toLowerCase().includes(q) ||
(l.email || '').toLowerCase().includes(q) ||
(l.contactName || '').toLowerCase().includes(q) ||
(l.website || '').toLowerCase().includes(q) ||
(l.country || '').toLowerCase().includes(q)
);
}
if (statusFilter !== 'all') {
switch (statusFilter) {
case 'new':
result = result.filter((l: any) => l.status === 'new' || l.currentState === 'input_ready');
break;
case 'drafted':
result = result.filter((l: any) =>
l.status === 'email_drafted' || l.status === 'followup_drafted' ||
l.currentState === 'waiting_user_send' || l.currentState === 'waiting_user_send_followup'
);
break;
case 'sent':
result = result.filter((l: any) =>
l.status === 'email_sent' || l.status === 'contacted' ||
l.currentState === 'waiting_response_status'
);
break;
case 'replied':
result = result.filter((l: any) =>
l.status === 'reply_received' || l.replyStatus !== 'not_checked'
);
break;
}
}
return result;
}, [leads, search, statusFilter]);

// Counts for filter badges
const counts = useMemo(() => {
if (!leads) return { all: 0, new: 0, drafted: 0, sent: 0, replied: 0 };
return {
all: leads.length,
new: leads.filter((l: any) => l.status === 'new' || l.currentState === 'input_ready').length,
drafted: leads.filter((l: any) =>
l.status === 'email_drafted' || l.status === 'followup_drafted' ||
l.currentState === 'waiting_user_send' || l.currentState === 'waiting_user_send_followup'
).length,
sent: leads.filter((l: any) =>
l.status === 'email_sent' || l.status === 'contacted' ||
l.currentState === 'waiting_response_status'
).length,
replied: leads.filter((l: any) =>
l.status === 'reply_received' || l.replyStatus !== 'not_checked'
).length,
};
}, [leads]);

if (isLoading) {
return (
<div className="flex items-center justify-center py-20">
<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
</div>
);
}

return (
<div className="space-y-6">
<div className="flex items-center justify-between">
<div>
<h1 className="text-2xl font-semibold tracking-tight">客户管理</h1>
<p className="text-muted-foreground mt-1">查看和管理所有潜在客户</p>
</div>
<Button onClick={() => setLocation('/')}>
<Mail className="mr-2 h-4 w-4" />新增客户
</Button>
</div>

{selectedLeads.size > 0 && (
<div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2">
<span className="text-sm font-medium">已选择 {selectedLeads.size} 个客户</span>
<Button variant="ghost" size="sm" onClick={() => setSelectedLeads(new Set())}>取消选择</Button>
<Button variant="ghost" size="sm" onClick={() => { const allIds = new Set(filteredLeads.map((l: any) => l.id)); setSelectedLeads(allIds); }}>全选当前</Button>
<Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}><Trash2 className="mr-1 h-4 w-4" />删除所选</Button>
</div>
)}

{/* Search & Filter */}
<div className="flex flex-col sm:flex-row gap-3">
<div className="relative flex-1">
<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
<Input
placeholder="搜索公司、邮箱、联系人..."
value={search}
onChange={(e) => setSearch(e.target.value)}
className="pl-9"
/>
{search && (
<button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
<X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
</button>
)}
</div>
<div className="flex gap-1.5">
{filterOptions.map(opt => (
<Button
key={opt.key}
variant={statusFilter === opt.key ? 'default' : 'outline'}
size="sm"
onClick={() => setStatusFilter(opt.key)}
className="text-xs"
>
{opt.label}
{(counts as any)[opt.key] > 0 && (
<span className="ml-1 text-[10px] opacity-70">({(counts as any)[opt.key]})</span>
)}
</Button>
))}
</div>
</div>

{!leads?.length ? (
<Card className="border-dashed">
<CardContent className="flex flex-col items-center justify-center py-16">
<Globe className="h-12 w-12 text-muted-foreground/50 mb-4" />
<p className="text-muted-foreground text-center">暂无客户数据</p>
<p className="text-sm text-muted-foreground/70 text-center mt-1">在工作台添加客户网站和邮箱开始分析</p>
<Button variant="outline" className="mt-4" onClick={() => setLocation('/')}>
前往工作台
</Button>
</CardContent>
</Card>
) : filteredLeads.length === 0 ? (
<Card className="border-dashed">
<CardContent className="flex flex-col items-center justify-center py-12">
<Search className="h-8 w-8 text-muted-foreground/50 mb-3" />
<p className="text-muted-foreground text-center">没有匹配的客户</p>
<Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
清除筛选
</Button>
</CardContent>
</Card>
) : (
<div className="grid gap-3">
<p className="text-xs text-muted-foreground">{filteredLeads.length} 条结果</p>
{filteredLeads.map((lead: any) => {
const emailStatus = emailStatusConfig[lead.status] || emailStatusConfig.new;
const StatusIcon = emailStatus.icon;
return (
<Card
key={lead.id}
className="cursor-pointer hover:border-primary/30 transition-all group"
onClick={() => setLocation(`/leads/${lead.id}`)}
>
<CardContent className="py-4">
<div className="flex items-center justify-between gap-4">
<div className="flex items-center gap-4 min-w-0 flex-1">
<input type="checkbox" className="h-4 w-4 shrink-0" checked={selectedLeads.has(lead.id)} onChange={() => { const next = new Set(selectedLeads); if (next.has(lead.id)) next.delete(lead.id); else next.add(lead.id); setSelectedLeads(next); }} onClick={(e) => e.stopPropagation()} />
<div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
<Building2 className="h-5 w-5 text-primary" />
</div>
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2">
<p className="font-medium truncate">{lead.companyName || lead.website}</p>
{lead.contactName && (
<span className="text-sm text-muted-foreground">({lead.contactName})</span>
)}
</div>
<div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
<span className="flex items-center gap-1 truncate">
<Mail className="h-3 w-3" />{lead.email}
</span>
{lead.country && (
<span className="flex items-center gap-1">
<MapPin className="h-3 w-3" />{lead.country}
</span>
)}
</div>
</div>
</div>

<div className="flex items-center gap-2 shrink-0">
{/* Email status indicator */}
<div className={`flex items-center gap-1 text-xs ${emailStatus.color}`}>
<StatusIcon className="h-3.5 w-3.5" />
<span className="hidden sm:inline">{emailStatus.label}</span>
</div>

{/* State badge */}
<Badge variant="outline" className={statusColorMap[lead.statusColor] || statusColorMap.slate}>
{stateLabels[lead.currentState] || lead.currentState}
</Badge>
{lead.currentRound > 0 && (
<Badge variant="secondary" className="text-xs">
R{lead.currentRound}
</Badge>
)}
<ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
</div>
</div>
</CardContent>
</Card>
);
})}
</div>
)}
{showDeleteConfirm && (
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
<div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-lg" onClick={(e: any) => e.stopPropagation()}>
<h3 className="text-lg font-semibold mb-2">确认删除</h3>
<p className="text-muted-foreground mb-4">确定要删除选中的 {selectedLeads.size} 个客户吗？此操作不可撤销。</p>
<div className="flex justify-end gap-2">
<Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
<Button variant="destructive" onClick={() => deleteManyMutation.mutate({ leadIds: Array.from(selectedLeads) })} disabled={deleteManyMutation.isPending}>{deleteManyMutation.isPending ? '删除中...' : '确认删除'}</Button>
</div>
</div>
</div>
)}
</div>
);
}
