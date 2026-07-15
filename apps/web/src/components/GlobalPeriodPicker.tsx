import { useEffect } from "react";
import { DatePicker, Typography } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { usePeriod } from "../lib/period-context";
import { useWorkspaceMode } from "../lib/workspace-mode";
import { isTypingTarget } from "../lib/use-list-hotkeys";
import { shiftPeriod } from "../lib/period-shift";

const { Text } = Typography;

/** 桌面端判定：SSR / node 测试环境下无 window，安全返回 false。 */
function isDesktopViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(min-width: 1024px)").matches;
  } catch {
    return false;
  }
}

/**
 * 全局会计期间选择器（顶栏）。选定后所有期间相关页面默认跟随。
 * V7 L4：pro 模式下支持键盘快切 `[` 上一月 / `]` 下一月（跨年自动进退），
 * 焦点在输入类元素或弹层内时不响应（守卫复用 use-list-hotkeys 的 isTypingTarget）。
 */
export function GlobalPeriodPicker({ compact = false }: { compact?: boolean }) {
  const { period, setPeriod } = usePeriod();
  const { mode } = useWorkspaceMode();
  const isPro = mode === "pro";
  const showHotkeyHint = isPro && !compact && isDesktopViewport();

  useEffect(() => {
    if (!isPro) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "[" && event.key !== "]") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setPeriod(shiftPeriod(period, event.key === "]" ? 1 : -1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPro, period, setPeriod]);

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {!compact && <Text style={{ color: "#94a3b8", fontSize: 12 }}>会计期间</Text>}
      <DatePicker
        picker="month"
        size="small"
        allowClear={false}
        suffixIcon={<CalendarOutlined style={{ color: "#64748b" }} />}
        value={dayjs(period + "-01")}
        format="YYYY-MM"
        onChange={(d) => { if (d) setPeriod(d.format("YYYY-MM")); }}
        aria-label="全局会计期间"
        style={{ width: 130 }}
      />
      {showHotkeyHint && (
        <Text style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap" }} aria-hidden="true">
          [ ] 切换月份
        </Text>
      )}
    </div>
  );
}
