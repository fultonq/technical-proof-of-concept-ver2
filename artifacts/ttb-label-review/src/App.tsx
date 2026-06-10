import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import UploadPage from "@/pages/upload";
import ResultsPage from "@/pages/results";
import LabelDetailPage from "@/pages/label-detail";
import ManagePage from "@/pages/manage";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen flex flex-col font-sans">
      <header className="bg-primary text-primary-foreground border-b border-primary-foreground/20 px-6 py-4 flex items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-1.5 rounded">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight">TTB Label Review PoC</h1>
            <p className="text-primary-foreground/70 text-xs font-medium uppercase tracking-wider">Department of the Treasury</p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col bg-background relative z-0">
        <Switch>
          <Route path="/" component={UploadPage} />
          <Route path="/manage" component={ManagePage} />
          <Route path="/results/:sessionId" component={ResultsPage} />
          <Route path="/results/:sessionId/:labelId" component={LabelDetailPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
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
