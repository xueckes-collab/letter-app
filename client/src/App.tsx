import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import LeadsPage from "./pages/Leads";
import ProfilePage from "./pages/Profile";
import LeadDetailPage from "./pages/LeadDetail";
import AdminPage from "./pages/Admin";
import AutomationPage from "./pages/Automation";
import EmailSettingsPage from "./pages/EmailSettings";
import FeedbackPage from "./pages/Feedback";
import LoginPage from "./pages/Login";

function Router() {
  return (
    <Switch>
      {/* Login page - no dashboard layout */}
      <Route path="/login" component={LoginPage} />
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
            <Route path="/admin" component={AdminPage} />
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
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
