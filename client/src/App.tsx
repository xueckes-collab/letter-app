import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import LeadsPage from "./pages/Leads";
import ProfilePage from "./pages/Profile";
import LeadDetailPage from "./pages/LeadDetail";
import AutomationPage from "./pages/Automation";
import EmailSettingsPage from "./pages/EmailSettings";
import FeedbackPage from "./pages/Feedback";
import LoginPage from "./pages/Login";

// ── Admin pages ──────────────────────────────────────────────────
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminEmails from "./pages/admin/AdminEmails";
import AdminAutomation from "./pages/admin/AdminAutomation";
import AdminAudit from "./pages/admin/AdminAudit";
import AdminFeedback from "./pages/admin/AdminFeedback";
import AdminPrompts from "./pages/admin/AdminPrompts";

// ── Admin container: wraps AdminLayout + handles internal routing ─
function AdminContainer() {
  const [location] = useLocation();

  // Determine the section from the path
  const section = location
    .replace("/admin/", "")
    .replace("/admin", "")
    .split("/")[0] || "dashboard";

  const pageMap: Record<string, React.ReactNode> = {
    dashboard:  <AdminDashboard />,
    users:      <AdminUsers />,
    emails:     <AdminEmails />,
    automation: <AdminAutomation />,
    audit:      <AdminAudit />,
    feedback:   <AdminFeedback />,
    prompts:    <AdminPrompts />,
  };

  return (
    <AdminLayout>
      {pageMap[section] ?? <AdminDashboard />}
    </AdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Login page — no layout */}
      <Route path="/login" component={LoginPage} />

      {/* ── Admin pages — have their own AdminLayout, NOT DashboardLayout */}
      <Route path="/admin/:rest*" component={AdminContainer} />
      <Route path="/admin" component={AdminContainer} />

      {/* All other pages use DashboardLayout */}
      <Route>
        <DashboardLayout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/leads" component={LeadsPage} />
            <Route path="/leads/:id" component={LeadDetailPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/automation" component={AutomationPage} />
            <Route path="/email-settings" component={EmailSettingsPage} />
            <Route path="/feedback" component={FeedbackPage} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </DashboardLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
