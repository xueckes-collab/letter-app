import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, Users, Mail, Zap, ClipboardList,
  MessageSquarePlus, Wand2, ChevronRight, LogOut,
  Shield, Sun, Moon, Monitor, ArrowLeft, Bell,
} from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

// ─── Navigation config ──────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "仪表盘",   path: "/admin/dashboard" },
  { icon: Users,           label: "用户管理",  path: "/admin/users"     },
  { icon: Mail,            label: "邮件任务",  path: "/admin/emails"    },
  { icon: Zap,             label: "自动化",    path: "/admin/automation" },
  { icon: ClipboardList,   label: "审计日志",  path: "/admin/audit"     },
  { icon: MessageSquarePlus, label: "用户反馈", path: "/admin/feedback"  },
  { icon: Wand2,           label: "AI提示词",  path: "/admin/prompts"   },
];

// ─── Breadcrumb label map ───────────────────────────────────────
const SECTION_LABELS: Record<string, string> = {
  dashboard:  "仪表盘",
  users:      "用户管理",
  emails:     "邮件任务",
  automation: "自动化",
  audit:      "审计日志",
  feedback:   "用户反馈",
  prompts:    "AI提示词",
};

// ─── Notification bell (inline) ────────────────────────────────
function AdminNotificationBell() {
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: notifications } = trpc.notifications.list.useQuery();
  const markRead = trpc.notifications.markRead.useMutation();
  const markAllRead = trpc.notifications.markAllRead.useMutation();
  const utils = trpc.useUtils();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors">
          <Bell className="h-4 w-4 text-white/70" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center px-1">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <span className="text-sm font-medium">通知</span>
          {(unreadCount ?? 0) > 0 && (
            <button
              onClick={() => markAllRead.mutate(undefined, { onSuccess: () => { utils.notifications.unreadCount.invalidate(); utils.notifications.list.invalidate(); } })}
              className="text-xs text-primary hover:underline"
            >全部已读</button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {(!notifications || notifications.length === 0)
            ? <div className="p-4 text-center text-xs text-muted-foreground">暂无通知</div>
            : notifications.slice(0, 10).map(n => (
                <button key={n.id}
                  onClick={() => markRead.mutate({ notificationId: n.id }, { onSuccess: () => { utils.notifications.unreadCount.invalidate(); utils.notifications.list.invalidate(); } })}
                  className={`w-full text-left p-3 border-b last:border-0 hover:bg-accent/50 transition-colors ${!n.isRead ? 'bg-primary/5' : ''}`}
                >
                  <p className="text-xs font-medium truncate">{n.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                </button>
              ))
          }
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main AdminLayout ───────────────────────────────────────────
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [location, setLocation] = useLocation();

  // ── Guard ──────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Shield className="h-8 w-8 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">验证管理员权限…</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  // ── Current section ────────────────────────────────────────
  const section = location.replace("/admin/", "").replace("/admin", "") || "dashboard";
  const sectionLabel = SECTION_LABELS[section] ?? section;

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col bg-slate-900 dark:bg-slate-950 text-white border-r border-white/10">
        {/* Logo area */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-white/10 shrink-0">
          <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none truncate">管理后台</p>
            <p className="text-[10px] text-white/40 mt-0.5 truncate">Admin Panel</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
            const isActive = location === path || (path !== "/admin/dashboard" && location.startsWith(path));
            return (
              <button
                key={path}
                onClick={() => setLocation(path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group ${
                  isActive
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-white/60 hover:text-white hover:bg-white/8"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-white/50 group-hover:text-white/80"}`} />
                <span className="truncate">{label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto text-primary/60" />}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-3 space-y-2 shrink-0">
          {/* Back to app */}
          <button
            onClick={() => setLocation("/")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/8 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回应用
          </button>

          {/* User info */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/8 transition-colors text-left">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-xs bg-primary/20 text-primary">
                    {user.name?.charAt(0).toUpperCase() ?? "A"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white truncate">{user.name ?? "-"}</p>
                  <p className="text-[10px] text-white/40 truncate">{user.email ?? "-"}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-44">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">主题</div>
              <DropdownMenuRadioGroup value={theme} onValueChange={v => setTheme(v as any)}>
                <DropdownMenuRadioItem value="light"><Sun className="h-3.5 w-3.5 mr-1.5" />浅色</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark"><Moon className="h-3.5 w-3.5 mr-1.5" />深色</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system"><Monitor className="h-3.5 w-3.5 mr-1.5" />跟随系统</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                <LogOut className="h-3.5 w-3.5 mr-1.5" />退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-6 border-b bg-background/95 backdrop-blur shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-foreground font-medium">管理后台</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{sectionLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <AdminNotificationBell />
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
              <Shield className="h-2.5 w-2.5 mr-1" />管理员
            </Badge>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
