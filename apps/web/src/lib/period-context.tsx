/**
 * 全局会计期间上下文
 * 所有期间相关页面（工资/总账/报表/代发/导出/税务）默认读取此处选定的期间，
 * 避免在每个页面重复输入 YYYY-MM。页内可临时覆盖，不影响全局。
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "finance-taxation-active-period";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isValidPeriod(p: string | null): p is string {
  return !!p && /^\d{4}-\d{2}$/.test(p);
}

function readStored(): string {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isValidPeriod(v) ? v : currentMonth();
  } catch {
    return currentMonth();
  }
}

interface PeriodContextValue {
  period: string;
  setPeriod: (period: string) => void;
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<string>(() => readStored());

  const setPeriod = useCallback((next: string) => {
    if (!isValidPeriod(next)) return;
    setPeriodState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  return (
    <PeriodContext.Provider value={{ period, setPeriod }}>
      {children}
    </PeriodContext.Provider>
  );
}

/** 读取全局期间。在 Provider 之外调用时回落到当前月（只读）。 */
export function usePeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext);
  if (!ctx) {
    return { period: currentMonth(), setPeriod: () => { /* no-op outside provider */ } };
  }
  return ctx;
}
