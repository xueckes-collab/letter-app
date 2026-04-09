import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap, RefreshCw, Loader2, Clock, RotateCcw, Mail,
  CheckCircle2, XCircle, BellRing, Timer, Send,
} from "lucide-react";

// ─── Format seconds to human readable ─────────────────────────
function formatDelay(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  return `${Math.floor(seconds / 3600)} 小时`;
}

// ─── Toggle indicator ───────────────────────────────────────────
function ToggleBadge({ enabled, labelOn, labelOff }: { enabled: boolean; labelOn: string; labelOff: string }) {
  return enabled ? (
    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 gap-1">
      <CheckCircle2 className="h-2.5 w-2.5" />{labelOn}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
      <XCircle className="h-2.5 w-2.5" />{labelOff}
    </Badge>
  );
}

// ─── Setting row ────────────────────────────────────────────────
function SettingRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

// ─── Main AdminAutomation ────────────────────────────────────────
export default function AdminAutomation() {
  const { data: automationList, isLoading, refetch } = trpc.admin.listAllAutomation.useQuery();

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">自动化管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            查看所有用户的自动跟进规则配置（共 {automationList?.length ?? 0} 条）
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />刷新
        </Button>
      </div>

      {/* Overview stats */}
      {automationList && automationList.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "已启用自动跟进",
              value: automationList.filter((a: any) => a.autoFollowUpEnabled).length,
              color: "text-emerald-500",
            },
            {
              label: "已启用自动发送",
              value: automationList.filter((a: any) => a.autoSendFollowUp).length,
              color: "text-blue-500",
            },
            {
              label: "平均跟进间隔",
              value: `${Math.round(automationList.reduce((s: number, a: any) => s + a.followUpHours, 0) / automationList.length)}h`,
              color: "text-amber-500",
            },
            {
              label: "平均最大轮数",
              value: `${Math.round(automationList.reduce((s: number, a: any) => s + a.maxFollowUpRounds, 0) / automationList.length)} 轮`,
              color: "text-purple-500",
            },
          ].map(({ label, value, color }) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* User automation list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !automationList || automationList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Zap className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">暂无用户自动化配置</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {automationList.map((a: any) => (
            <Card key={a.id} className="relative">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-medium truncate">
                      {a.userName || "未命名用户"}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {a.userEmail || "-"}
                    </p>
                  </div>
                  <ToggleBadge
                    enabled={a.autoFollowUpEnabled}
                    labelOn="跟进中"
                    labelOff="已停用"
                  />
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-4 space-y-0.5 divide-y">
                <SettingRow
                  icon={Clock}
                  label="跟进间隔"
                  value={<span className="text-sm font-medium">{a.followUpHours} 小时</span>}
                />
                <SettingRow
                  icon={RotateCcw}
                  label="最大轮数"
                  value={<span className="text-sm font-medium">{a.maxFollowUpRounds} 轮</span>}
                />
                <SettingRow
                  icon={Timer}
                  label="发送间隔"
                  value={<span className="text-sm font-medium">{formatDelay(a.sendDelaySeconds)}</span>}
                />
                <SettingRow
                  icon={Send}
                  label="自动发送"
                  value={<ToggleBadge enabled={a.autoSendFollowUp} labelOn="自动" labelOff="手动" />}
                />
                <SettingRow
                  icon={Mail}
                  label="回复检测"
                  value={<ToggleBadge enabled={a.replyCheckEnabled} labelOn="开启" labelOff="关闭" />}
                />
                <SettingRow
                  icon={BellRing}
                  label="回复通知"
                  value={<ToggleBadge enabled={true} labelOn="开启" labelOff="关闭" />}
                />

                <div className="pt-2">
                  <p className="text-[10px] text-muted-foreground">
                    更新时间：{a.updatedAt ? new Date(a.updatedAt).toLocaleDateString("zh-CN") : "-"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Notice */}
      <Card className="border-dashed">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-3">
            <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">关于自动化管理</p>
              <p>管理员当前可以查看所有用户的自动化配置。用户个人的跟进规则由用户自行在"自动化"页面管理。</p>
              <p className="text-xs">即将上线功能：全局强制暂停、批量调整间隔、调度器健康检查、触发历史记录。</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
