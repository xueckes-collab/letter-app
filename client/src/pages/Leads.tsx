import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { Globe, Mail, ArrowRight, Loader2, Building2, MapPin, Search, X } from "lucide-react";

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

const filterOptions = [
  { key: 'all', label: '全部' },
  { key: 'waiting_user_send', label: '待发送' },
  { key: 'waiting_response_status', label: '等待回复' },
  { key: 'drafting_reply_email', label: '已回复' },
];

export default function LeadsPage() {
  const [, setLocation] = useLocation();
  const { data: leads, isLoading } = trpc.leads.list.useQuery();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
      if (statusFilter === 'drafting_reply_email') {
        result = result.filter((l: any) => l.replyStatus !== 'not_checked');
      } else {
        result = result.filter((l: any) => l.currentState === statusFilter || l.currentState === statusFilter + '_followup');
      }
    }
    return result;
  }, [leads, search, statusFilter]);

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
          {filteredLeads.map((lead: any) => (
            <Card
              key={lead.id}
              className="cursor-pointer hover:border-primary/30 transition-all group"
              onClick={() => setLocation(`/leads/${lead.id}`)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
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

                  <div className="flex items-center gap-3 shrink-0">
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
          ))}
        </div>
      )}
    </div>
  );
}
