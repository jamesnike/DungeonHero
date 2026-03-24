import { useState, useCallback, useRef } from "react";
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
  const [showLoading, setShowLoading] = useState(true);
  const gameMountedFrames = useRef(0);
  const rafRef = useRef<number | null>(null);

  const handleReady = useCallback(() => {
    const warmUp = () => {
      gameMountedFrames.current += 1;
      if (gameMountedFrames.current >= 10) {
        setShowLoading(false);
      } else {
        rafRef.current = requestAnimationFrame(warmUp);
      }
    };
    rafRef.current = requestAnimationFrame(warmUp);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {/* Game renders immediately but is invisible under the loading screen */}
        <div style={showLoading ? { visibility: 'hidden', position: 'fixed', inset: 0, zIndex: 0 } : undefined}>
          <Router />
        </div>
        {showLoading && <LoadingScreen onReady={handleReady} />}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
