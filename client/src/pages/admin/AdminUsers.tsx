import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users, Search, Loader2, Shield, User as UserIcon,
  ChevronDown, MoreVertical, Eye, RefreshCw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

// ─── Role badge ──────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  return role === "admin" ? (
    <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30 hover:bg-primary/20 gap-1">
      <Shield className="h-2.5 w-2.5" />管理员
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px] gap-1">
      <UserIcon className="h-2.5 w-2.5" />普通用户
    </Badge>
  );
}

// ─── Login method badge ─────────────────────────────────────────
function LoginBadge({ method }: { method: string | null }) {
  const map: Record<string, string> = { google: "Google", email: "邮箱密码", sms: "短信" };
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground">
      {map[method ?? ""] ?? method ?? "-"}
    </span>
  );
}

// ─── User detail dialog ─────────────────────────────────────────
function UserDetailDialog({ user, onClose }: { user: any; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {user.name?.charAt(0).toUpperCase() ?? "U"}
              </span>
            </div>
            {user.name ?? "未命名"}
          </DialogTitle>
          <DialogDescription>{user.email ?? user.openId ?? "-"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm mt-2">
          {[
            { label: "用户 ID",   value: `#${user.id}` },
            { label: "角色",      value: <RoleBadge role={user.role} /> },
            { label: "登录方式",  value: <LoginBadge method={user.loginMethod} /> },
            { label: "注册时间",  value: user.createdAt ? new Date(user.createdAt).toLocaleString("zh-CN") : "-" },
            { label: "最后登录",  value: user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleString("zh-CN") : "-" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1 border-b last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t mt-2">
          <p className="text-xs text-muted-foreground text-center">
            * 更多用户操作功能（封号、重置密码等）即将上线
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main AdminUsers ────────────────────────────────────────────
export default function AdminUsers() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const { data: usersList, isLoading, refetch } = trpc.admin.listUsers.useQuery();
  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`角色已更新为「${vars.role === "admin" ? "管理员" : "普通用户"}」`);
      refetch();
    },
    onError: e => toast.error("更新失败：" + e.message),
  });

  // ── Filter ──────────────────────────────────────────────────
  const filtered = (usersList ?? []).filter((u: any) => {
    const matchSearch = !search
      || u.name?.toLowerCase().includes(search.toLowerCase())
      || u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const adminCount = (usersList ?? []).filter((u: any) => u.role === "admin").length;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">用户管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            共 {usersList?.length ?? 0} 名用户，其中 {adminCount} 名管理员
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />刷新
        </Button>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索姓名或邮箱…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "admin", "user"] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                roleFilter === r
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {r === "all" ? "全部" : r === "admin" ? "管理员" : "普通用户"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {search || roleFilter !== "all" ? "没有匹配的用户" : "暂无用户"}
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1.5fr_auto] gap-4 px-4 py-2.5 border-b bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                <span>用户</span>
                <span>邮箱</span>
                <span>角色</span>
                <span>登录方式</span>
                <span>最后登录</span>
                <span />
              </div>
              {/* Table rows */}
              <div className="divide-y">
                {filtered.map((u: any) => (
                  <div
                    key={u.id}
                    className="grid grid-cols-[2fr_2fr_1fr_1fr_1.5fr_auto] gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                  >
                    {/* Name + avatar */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-primary">
                          {u.name?.charAt(0).toUpperCase() ?? "U"}
                        </span>
                      </div>
                      <span className="text-sm font-medium truncate">{u.name || "未命名"}</span>
                      {me?.id === u.id && (
                        <Badge variant="outline" className="text-[9px] shrink-0">本账号</Badge>
                      )}
                    </div>

                    {/* Email */}
                    <span className="text-sm text-muted-foreground truncate">
                      {u.email ?? u.openId ?? "-"}
                    </span>

                    {/* Role */}
                    <RoleBadge role={u.role} />

                    {/* Login method */}
                    <LoginBadge method={u.loginMethod} />

                    {/* Last login */}
                    <span className="text-xs text-muted-foreground">
                      {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("zh-CN") : "-"}
                    </span>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => setSelectedUser(u)}>
                          <Eye className="h-3.5 w-3.5 mr-2" />查看详情
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.role !== "admin" ? (
                          <DropdownMenuItem
                            disabled={updateRole.isPending || me?.id === u.id}
                            onClick={() => updateRole.mutate({ userId: u.id, role: "admin" })}
                          >
                            <Shield className="h-3.5 w-3.5 mr-2" />设为管理员
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            disabled={updateRole.isPending || me?.id === u.id}
                            onClick={() => updateRole.mutate({ userId: u.id, role: "user" })}
                            className="text-destructive focus:text-destructive"
                          >
                            <UserIcon className="h-3.5 w-3.5 mr-2" />撤销管理员
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled className="text-muted-foreground/50 text-xs">
                          重置密码（即将上线）
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="text-muted-foreground/50 text-xs">
                          封禁账号（即将上线）
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      {selectedUser && (
        <UserDetailDialog user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}
