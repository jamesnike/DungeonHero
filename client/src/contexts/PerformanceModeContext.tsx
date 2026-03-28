import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const STORAGE_KEY = 'dh-low-perf-mode';

function detectLowPerfDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (!isIOS) return false;

  const match = ua.match(/OS (\d+)_/);
  if (match) {
    const majorVersion = parseInt(match[1], 10);
    if (majorVersion > 0 && majorVersion <= 16) return true;
  }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      if (typeof renderer === 'string' && /Apple A[89]|Apple A1[012]/.test(renderer)) {
        return true;
      }
    }
  }

  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
    return true;
  }

  return false;
}

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
    return detectLowPerfDevice();
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isLowPerf) {
      root.classList.add('low-perf-mode');
    } else {
      root.classList.remove('low-perf-mode');
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
