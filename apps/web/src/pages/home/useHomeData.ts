/**
 * K1 老板工作台 · 数据装配 hook
 * 四路数据并行拉取（AI 草稿 / 统一收件箱 / 驾驶舱 / 现金流预测），
 * 任一失败不拖垮整页：失败的数据源置空 **并逐路打上失败标记**，
 * 呈现层据此把「取不到」说成「取不到」，绝不退化成「都办完了」。
 * 全部失败才报整页错误。
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

/** 逐数据源失败标记：true = 这一路接口没拿到数据（网络故障或无权限 403）。 */
export interface HomeDataFailures {
  drafts: boolean;
  inbox: boolean;
  dashboard: boolean;
  forecast: boolean;
}

export interface HomeData {
  drafts: CloseDraft[];
  inboxItems: InboxItem[];
  dashboard: DashboardData | null;
  forecast: CashForecast | null;
  failures: HomeDataFailures;
}

interface HomeDataState extends HomeData {
  loading: boolean;
  error: string | null;
}

const NO_FAILURES: HomeDataFailures = {
  drafts: false,
  inbox: false,
  dashboard: false,
  forecast: false
};

const INITIAL_STATE: HomeDataState = {
  drafts: [],
  inboxItems: [],
  dashboard: null,
  forecast: null,
  failures: NO_FAILURES,
  loading: true,
  error: null
};

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function failed(result: PromiseSettledResult<unknown>): boolean {
  return result.status === "rejected";
}

export function useHomeData(): HomeDataState & { reload: () => Promise<void>; reloadDrafts: () => Promise<void> } {
  const [state, setState] = useState<HomeDataState>(INITIAL_STATE);

  const reload = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const [draftsRes, inboxRes, dashboardRes, forecastRes] = await Promise.allSettled([
      getCloseDrafts(),
      getInbox(),
      getDashboardChairman(),
      getCashForecast()
    ]);

    const failures: HomeDataFailures = {
      drafts: failed(draftsRes),
      inbox: failed(inboxRes),
      dashboard: failed(dashboardRes),
      forecast: failed(forecastRes)
    };
    const allFailed = Object.values(failures).every(Boolean);

    setState({
      drafts: settled(draftsRes)?.items ?? [],
      inboxItems: settled(inboxRes)?.items ?? [],
      dashboard: settled(dashboardRes),
      forecast: settled(forecastRes)?.forecast ?? null,
      failures,
      loading: false,
      error: allFailed ? "工作台数据加载失败，请检查网络后重试" : null
    });
  }, []);

  /** 审批/驳回后只刷新草稿列表，避免整页闪烁；刷新失败保留旧列表但打标记，不装作列表是新的。 */
  const reloadDrafts = useCallback(async () => {
    try {
      const data = await getCloseDrafts();
      setState((prev) => ({ ...prev, drafts: data.items, failures: { ...prev.failures, drafts: false } }));
    } catch {
      setState((prev) => ({ ...prev, failures: { ...prev.failures, drafts: true } }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload, reloadDrafts };
}
