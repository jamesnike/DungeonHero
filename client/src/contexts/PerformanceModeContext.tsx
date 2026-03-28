import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const STORAGE_KEY = 'dh-low-perf-mode';

interface PerformanceModeValue {
  isLowPerf: boolean;
  toggle: () => void;
}

const PerformanceModeContext = createContext<PerformanceModeValue>({
  isLowPerf: false,
  toggle: () => {},
});

export function PerformanceModeProvider({ children }: { children: ReactNode }) {
  const [isLowPerf, setIsLowPerf] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === '1';
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isLowPerf) {
      root.classList.add('low-perf-mode');
      root.style.setProperty('--combat-animation-stagger', '70ms');
    } else {
      root.classList.remove('low-perf-mode');
      root.style.setProperty('--combat-animation-stagger', '160ms');
    }
  }, [isLowPerf]);

  const toggle = useCallback(() => {
    setIsLowPerf(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);

  return (
    <PerformanceModeContext.Provider value={{ isLowPerf, toggle }}>
      {children}
    </PerformanceModeContext.Provider>
  );
}

export function usePerformanceMode(): PerformanceModeValue {
  return useContext(PerformanceModeContext);
}
