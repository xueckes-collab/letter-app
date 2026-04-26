import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList, Shield, LogIn, Mail, Eye, Filter,
  RefreshCw, ChevronDown, Info,
} from "lucide-react";
import { useState, useMemo } from "react";

// ──────────────────────────────────────────────────────────────
// NOTE: Audit logs require a dedicated `audit_logs` table in the
// database schema. Since the schema doesn't have it yet, this page
// uses realistic mock data. To enable real logs:
//   1. Add audit_logs table to drizzle/schema.ts
//   2. Call `db:push` to migrate
//   3. Write to the table on each admin action / login event
//   4. Replace mock data below with trpc.admin.listAuditLogs query
// ──────────────────────────────────────────────────────────────

// ─── Mock data generators ──────────────────────────────────────
const ADMINS = ["admin@example.com", "superadmin@company.com"];
const USERS = ["alice@buyer.com", "bob@corp.com", "carol@ltd.com", "dave@intl.com"];

function randomDate(daysBack: number) {
  const d = new Date();
  d.setTime(d.getTime() - Math.random() * daysBack * 86400000);
  return d;
}

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

const MOCK_ADMIN_LOGS: AuditEntry[] = [
  { id: 1,  ts: randomDate(0.1), operator: ADMINS[0], operatorRole: "admin", action: "更新AI提示词", target: "email.warm",      detail: "修改了首封开发信的提示词，增加了个性化要求",      category: "admin", result: "success" },
  { id: 2,  ts: randomDate(0.5), operator: ADMINS[0], operatorRole: "admin", action: "修改用户角色", target: "carol@ltd.com",   detail: "将用户 carol@ltd.com 角色从 user 升级为 admin",  category: "admin", result: "success" },
  { id: 3,  ts: randomDate(1),   operator: ADMINS[1], operatorRole: "admin", action: "暂停邮件任务", target: "Email #1052",    detail: "因用户投诉，手动暂停了 bob@corp.com 的邮件任务", category: "admin", result: "success" },
  { id: 4,  ts: randomDate(1.5), operator: ADMINS[0], operatorRole: "admin", action: "更新AI提示词", target: "email.followup", detail: "优化了跟进邮件的提示词，调整了语气",               category: "admin", result: "success" },
  { id: 5,  ts: randomDate(2),   operator: ADMINS[1], operatorRole: "admin", action: "重置邮件任务", target: "Email #987",     detail: "将失败邮件 #987 重置为草稿状态",                  category: "admin", result: "success" },
  { id: 6,  ts: randomDate(3),   operator: ADMINS[0], operatorRole: "admin", action: "删除用户反馈", target: "Feedback #23",  detail: "删除了一条垃圾反馈内容",                           category: "admin", result: "success" },
  { id: 7,  ts: randomDate(4),   operator: ADMINS[0], operatorRole: "admin", action: "修改用户角色", target: "dave@intl.com",  detail: "将 dave@intl.com 从 admin 降级为 user",           category: "admin", result: "success" },
].sort((a, b) => b.ts.getTime() - a.ts.getTime());

const MOCK_LOGIN_LOGS: AuditEntry[] = [
  { id: 101, ts: randomDate(0.1), operator: USERS[0],   operatorRole: "user",   action: "用户登录", target: "Web",    detail: "邮箱密码登录，IP: 103.xx.xx.1",   category: "login", result: "success" },
  { id: 102, ts: randomDate(0.2), operator: USERS[1],   operatorRole: "user",   action: "用户登录", target: "Web",    detail: "Google OAuth 登录",               category: "login", result: "success" },
  { id: 103, ts: randomDate(0.3), operator: "unknown@hack.com", operatorRole: "user", action: "登录失败", target: "Web", detail: "密码错误，连续失败 3 次",        category: "login", result: "fail"    },
  { id: 104, ts: randomDate(0.5), operator: ADMINS[0],  operatorRole: "admin",  action: "管理员登录", target: "Web",  detail: "管理员登录后台，IP: 192.168.1.1", category: "login", result: "success" },
  { id: 105, ts: randomDate(0.8), operator: USERS[2],   operatorRole: "user",   action: "用户登录", target: "Web",    detail: "邮箱密码登录",                    category: "login", result: "success" },
  { id: 106, ts: randomDate(1),   operator: USERS[3],   operatorRole: "user",   action: "用户登出", target: "Web",    detail: "用户主动退出登录",                category: "login", result: "success" },
  { id: 107, ts: randomDate(1.5), operator: USERS[0],   operatorRole: "user",   action: "用户登录", target: "Mobile", detail: "邮箱密码登录（移动端）",          category: "login", result: "success" },
  { id: 108, ts: randomDate(2),   operator: "attacker@evil.com", operatorRole: "user", action: "登录失败", target: "Web", detail: "密码错误，已触发频率限制",    category: "login", result: "fail"    },
].sort((a, b) => b.ts.getTime() - a.ts.getTime());

const MOCK_EMAIL_LOGS: AuditEntry[] = [
  { id: 201, ts: randomDate(0.2), operator: USERS[0], operatorRole: "user", action: "发送邮件",    target: "prospect@buyer.com",  detail: "首封开发信已发送，SMTP 返回 250 OK",    category: "email", result: "success" },
  { id: 202, ts: randomDate(0.4), operator: USERS[1], operatorRole: "user", action: "发送失败",    target: "bad@invalid.com",     detail: "SMTP 返回 550，收件人地址不存在",       category: "email", result: "fail"    },
  { id: 203, ts: randomDate(0.6), operator: USERS[2], operatorRole: "user", action: "批量发送",    target: "15 封邮件",            detail: "批量发送完成，成功 14 封，失败 1 封",  category: "email", result: "warn"    },
  { id: 204, ts: randomDate(1),   operator: USERS[0], operatorRole: "user", action: "检测到回复",  target: "prospect@buyer.com",  detail: "客户回复了邮件，已触发回复分析",       category: "email", result: "success" },
  { id: 205, ts: randomDate(1.2), operator: "system",  operatorRole: "system", action: "自动跟进", target: "client2@corp.com",    detail: "调度器触发自动跟进，第 2 轮",           category: "email", result: "success" },
  { id: 206, ts: randomDate(2),   operator: USERS[3], operatorRole: "user", action: "AI 生成邮件", target: "lead#432",            detail: "GPT-5.5 生成开发信，耗时 3.2s",          category: "email", result: "success" },
  { id: 207, ts: randomDate(3),   operator: USERS[1], operatorRole: "user", action: "修改邮件",    target: "Email #789",          detail: "用户手动编辑了邮件标题和正文",          category: "email", result: "success" },
  { id: 208, ts: randomDate(4),   operator: "system",  operatorRole: "system", action: "发送超时", target: "Email #812",          detail: "SMTP 连接超时，任务标记为 failed",      category: "email", result: "fail"    },
].sort((a, b) => b.ts.getTime() - a.ts.getTime());

// ─── Category / Result badges ───────────────────────────────────
function ResultBadge({ result }: { result: string }) {
  const map = {
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    fail:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    warn:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
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
    admin:  "bg-primary/10 text-primary border-primary/20",
    user:   "bg-muted text-muted-foreground",
    system: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  const labels = { admin: "管理员", user: "用户", system: "系统" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] ${map[role as keyof typeof map] ?? "bg-muted text-muted-foreground"}`}>
      {labels[role as keyof typeof labels] ?? role}
    </span>
  );
}

// ─── Detail dialog ──────────────────────────────────────────────
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
            { label: "操作人",   value: entry.operator },
            { label: "身份",     value: <RoleBadge role={entry.operatorRole} /> },
            { label: "操作类型", value: entry.action },
            { label: "操作对象", value: entry.target },
            { label: "结果",     value: <ResultBadge result={entry.result} /> },
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

// ─── Log table ──────────────────────────────────────────────────
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
          <div key={entry.id} className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors">
            {/* Time + action */}
            <div>
              <p className="text-xs font-medium">{entry.action}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {entry.ts.toLocaleString("zh-CN")}
              </p>
            </div>
            {/* Operator */}
            <div className="min-w-0">
              <p className="text-xs truncate">{entry.operator}</p>
              <RoleBadge role={entry.operatorRole} />
            </div>
            {/* Target */}
            <p className="text-xs text-muted-foreground truncate">{entry.target}</p>
            {/* Result */}
            <ResultBadge result={entry.result} />
            {/* Detail button */}
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

// ─── Tab config ─────────────────────────────────────────────────
const TABS = [
  { key: "admin", label: "管理员操作", icon: Shield,      data: MOCK_ADMIN_LOGS },
  { key: "login", label: "登录日志",   icon: LogIn,       data: MOCK_LOGIN_LOGS },
  { key: "email", label: "邮件操作",   icon: Mail,        data: MOCK_EMAIL_LOGS },
];

// ─── Main AdminAudit ────────────────────────────────────────────
export default function AdminAudit() {
  const [activeTab, setActiveTab] = useState<"admin" | "login" | "email">("admin");
  const [resultFilter, setResultFilter] = useState<"all" | "success" | "fail" | "warn">("all");

  const currentData = useMemo(() => {
    const base = TABS.find(t => t.key === activeTab)!.data;
    return resultFilter === "all" ? base : base.filter(e => e.result === resultFilter);
  }, [activeTab, resultFilter]);

  const failCount = TABS.find(t => t.key === activeTab)!.data.filter(e => e.result === "fail").length;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">审计日志</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            系统操作、登录事件与关键邮件行为记录
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
            当前显示 Mock 数据（数据库审计表待接入）
          </Badge>
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />刷新
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-3">
        {TABS.map(({ key, label, icon: Icon, data }) => {
          const fails = data.filter(e => e.result === "fail").length;
          return (
            <button
              key={key}
              onClick={() => { setActiveTab(key as any); setResultFilter("all"); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeTab === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {fails > 0 && (
                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 ml-0.5">{fails}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Result filter */}
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {/* Table header */}
          <div className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr_auto] gap-3 px-4 py-2.5 border-b bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span>操作 / 时间</span>
            <span>操作人</span>
            <span>操作对象</span>
            <span>结果</span>
            <span />
          </div>
          <LogTable entries={currentData} />
        </CardContent>
      </Card>

      {/* Schema notice */}
      <Card className="border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-3">
            <ClipboardList className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">关于审计日志</p>
              <p>当前页面使用模拟数据展示审计日志结构与功能骨架。接入真实数据库审计日志需要：</p>
              <ol className="list-decimal ml-4 space-y-0.5 text-xs">
                <li>在 <code className="bg-muted px-1 rounded">drizzle/schema.ts</code> 中添加 <code className="bg-muted px-1 rounded">audit_logs</code> 表</li>
                <li>执行 <code className="bg-muted px-1 rounded">pnpm db:push</code> 进行数据库迁移</li>
                <li>在管理员操作和用户登录时写入日志记录</li>
                <li>在 <code className="bg-muted px-1 rounded">server/routers.ts</code> 中添加 <code className="bg-muted px-1 rounded">admin.listAuditLogs</code> 接口</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
