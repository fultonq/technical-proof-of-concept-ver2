import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import UploadPage from "@/pages/upload";
import ResultsPage from "@/pages/results";
import AllResultsPage from "@/pages/all-results";
import AnalyticsPage from "@/pages/analytics";
import LabelDetailPage from "@/pages/label-detail";
import ManagePage from "@/pages/manage";
import HelpPage from "@/pages/help";
import { AppShell } from "@/components/app-shell";
import { WizardBar } from "@/components/wizard-bar";
import { HelpBar } from "@/components/help-bar";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <WizardBar />
      <main className="flex-1 flex flex-col bg-background relative z-0 pb-14">
        <Switch>
          <Route path="/" component={UploadPage} />
          <Route path="/manage" component={ManagePage} />
          <Route path="/all-results" component={AllResultsPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/results/:sessionId" component={ResultsPage} />
          <Route path="/results/:sessionId/:labelId" component={LabelDetailPage} />
          <Route path="/help" component={HelpPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <HelpBar />
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
