/**
 * K1 老板工作台 · 数据装配 hook
 * 四路数据并行拉取（AI 草稿 / 统一收件箱 / 驾驶舱 / 现金流预测），
 * 任一失败不拖垮整页：失败的数据源置 null，全部失败才报整页错误。
 */
import { useCallback, useEffect, useState } from "react";
import {
  getCashForecast,
  getCloseDrafts,
  getDashboardChairman,
  getInbox,
  type CashForecast,
  type CloseDraft,
  type DashboardData,
  type InboxItem
} from "../../lib/api";

export interface HomeData {
  drafts: CloseDraft[];
  inboxItems: InboxItem[];
  dashboard: DashboardData | null;
  forecast: CashForecast | null;
}

interface HomeDataState extends HomeData {
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: HomeDataState = {
  drafts: [],
  inboxItems: [],
  dashboard: null,
  forecast: null,
  loading: true,
  error: null
};

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export function useHomeData(): HomeDataState & { reload: () => Promise<void>; reloadDrafts: () => Promise<void> } {
  const [state, setState] = useState<HomeDataState>(INITIAL_STATE);

  const reload = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const [draftsRes, inboxRes, dashboardRes, forecastRes] = await Promise.allSettled([
      getCloseDrafts("draft"),
      getInbox(),
      getDashboardChairman(),
      getCashForecast()
    ]);

    const allFailed = [draftsRes, inboxRes, dashboardRes, forecastRes].every(
      (result) => result.status === "rejected"
    );

    setState({
      drafts: settled(draftsRes)?.items ?? [],
      inboxItems: settled(inboxRes)?.items ?? [],
      dashboard: settled(dashboardRes),
      forecast: settled(forecastRes)?.forecast ?? null,
      loading: false,
      error: allFailed ? "工作台数据加载失败，请检查网络后重试" : null
    });
  }, []);

  /** 审批/驳回后只刷新草稿列表，避免整页闪烁。 */
  const reloadDrafts = useCallback(async () => {
    try {
      const data = await getCloseDrafts("draft");
      setState((prev) => ({ ...prev, drafts: data.items }));
    } catch {
      // 局部刷新失败静默保留旧列表，下一次整页 reload 兜底
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload, reloadDrafts };
}
