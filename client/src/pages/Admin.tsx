import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Loader2, Shield, Users, MessageSquarePlus, Star, Sparkles,
  Trash2, CheckCircle2, Archive, AlertCircle
} from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "待分析", color: "text-muted-foreground", icon: Loader2 },
  analyzed: { label: "已分析", color: "text-blue-500", icon: CheckCircle2 },
  valuable: { label: "有价值", color: "text-emerald-500", icon: Sparkles },
  archived: { label: "已归档", color: "text-muted-foreground/50", icon: Archive },
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "综合体验",
  feature: "功能建议",
  bug: "问题反馈",
  ux: "界面体验",
};

export default function AdminPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"users" | "feedback">("feedback");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    if (user && user.role !== 'admin') {
      setLocation('/');
    }
  }, [user, setLocation]);

  const { data: usersList, isLoading: usersLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: user?.role === 'admin',
  });

  const { data: feedbacks, isLoading: feedbacksLoading, refetch: refetchFeedbacks } = trpc.feedback.adminList.useQuery(undefined, {
    enabled: user?.role === 'admin',
  });

  const deleteFeedback = trpc.feedback.adminDelete.useMutation({
    onSuccess: () => {
      toast.success("反馈已删除");
      refetchFeedbacks();
    },
    onError: (e) => toast.error("删除失败：" + e.message),
  });

  const updateStatus = trpc.feedback.adminUpdateStatus.useMutation({
    onSuccess: () => {
      refetchFeedbacks();
    },
    onError: (e) => toast.error("更新失败：" + e.message),
  });

  if (user?.role !== 'admin') {
    return null;
  }

  const filteredFeedbacks = feedbacks?.filter((fb: any) =>
    filterStatus === "all" ? true : fb.status === filterStatus
  ) || [];

  const valuableCount = feedbacks?.filter((fb: any) => fb.status === 'valuable').length || 0;
  const pendingCount = feedbacks?.filter((fb: any) => fb.status === 'pending').length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          管理后台
        </h1>
        <p className="text-muted-foreground mt-1">管理用户、查看反馈分析</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("feedback")}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "feedback"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquarePlus className="h-4 w-4" />
          用户反馈
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{pendingCount}</Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "users"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          用户列表
        </button>
      </div>

      {/* Feedback Panel */}
      {activeTab === "feedback" && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">总反馈</p>
              <p className="text-2xl font-bold">{feedbacks?.length || 0}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">有价值</p>
              <p className="text-2xl font-bold text-emerald-500">{valuableCount}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">待分析</p>
              <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
            </Card>
          </div>

          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {["all", "valuable", "pending", "analyzed", "archived"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {s === "all" ? "全部" : STATUS_CONFIG[s]?.label || s}
              </button>
            ))}
          </div>

          {/* Feedback List */}
          {feedbacksLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFeedbacks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquarePlus className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">暂无{filterStatus !== "all" ? `"${STATUS_CONFIG[filterStatus]?.label}"` : ""}反馈</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {[...filteredFeedbacks].reverse().map((fb: any) => {
                const statusConf = STATUS_CONFIG[fb.status] || STATUS_CONFIG.pending;
                const StatusIcon = statusConf.icon;
                return (
                  <Card key={fb.id} className={fb.status === 'archived' ? 'opacity-50' : ''}>
                    <CardContent className="pt-4 pb-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} className={`h-3.5 w-3.5 ${s <= fb.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20'}`} />
                            ))}
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {CATEGORY_LABELS[fb.category] || fb.category}
                          </Badge>
                          <div className={`flex items-center gap-1 text-xs ${statusConf.color}`}>
                            <StatusIcon className={`h-3 w-3 ${fb.status === 'pending' ? 'animate-spin' : ''}`} />
                            {statusConf.label}
                          </div>
                          {fb.aiScore !== null && fb.aiScore !== undefined && (
                            <span className="text-xs text-muted-foreground">AI评分: {fb.aiScore}/100</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {new Date(fb.createdAt).toLocaleDateString('zh-CN')}
                          </span>
                          {fb.status !== 'valuable' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => updateStatus.mutate({ id: fb.id, status: 'valuable' })}
                              disabled={updateStatus.isPending}
                            >
                              有价值
                            </Button>
                          )}
                          {fb.status !== 'archived' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => updateStatus.mutate({ id: fb.id, status: 'archived' })}
                              disabled={updateStatus.isPending}
                            >
                              归档
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteFeedback.mutate({ id: fb.id })}
                            disabled={deleteFeedback.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <p className="text-sm">{fb.content}</p>

                      {fb.aiAnalysis && (
                        <>
                          <Separator />
                          <div className="flex items-start gap-2">
                            <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground">{fb.aiAnalysis}</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Users Panel */}
      {activeTab === "users" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              用户列表
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {usersList?.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {u.name?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.name || '未命名'}</p>
                        <p className="text-xs text-muted-foreground">{u.email || u.openId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                        {u.role === 'admin' ? '管理员' : '用户'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : '-'}
                      </span>
                    </div>
                  </div>
                ))}
                {(!usersList || usersList.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">暂无用户</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
