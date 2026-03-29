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
    const WARM_UP_FRAMES = 30;
    const warmUp = () => {
      gameMountedFrames.current += 1;
      // Force a layout calculation on first few frames to pre-compute
      // CSS grid metrics and settle React reconciliation.
      if (gameMountedFrames.current <= 5) {
        const heroCard = document.querySelector('[data-testid="hero-card"]');
        if (heroCard) void (heroCard as HTMLElement).getBoundingClientRect();
        const canvas = document.querySelector('.dice-canvas');
        if (canvas) void (canvas as HTMLElement).getBoundingClientRect();
        const grid = document.querySelector('.dh-grid-cell');
        if (grid) void (grid as HTMLElement).offsetHeight;
      }
      if (gameMountedFrames.current >= WARM_UP_FRAMES) {
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
