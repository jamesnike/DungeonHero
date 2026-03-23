import { useState, useCallback } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import LoadingScreen from "@/components/LoadingScreen";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {ready ? (
          <>
            <Toaster />
            <Router />
          </>
        ) : (
          <LoadingScreen onReady={handleReady} />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
