/**
 * 资产与往来（路由 /assets）。
 *
 * 容器负责壳层（横幅 / 标题 / 任务切换器），三个子面板只提供内容主体，
 * 一次只有一件事进 DOM——与 /bills 同一套约定。
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProPageBanner } from "../../components/ui/ProPageBanner";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { resolveActiveTask } from "../../lib/task-focus";
import { FixedAssetsPanel } from "./FixedAssetsPanel";
import { AgingPanel } from "./AgingPanel";
import { RecurringVouchersPanel } from "./RecurringVouchersPanel";
import {
  ASSETS_TAB_KEYS,
  ASSETS_TAB_QUERY_KEY,
  DEFAULT_ASSETS_TAB,
  buildAssetsTasks,
  getAssetsTabTitle
} from "./assets-tasks";

export function AssetsCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tasks = useMemo(() => buildAssetsTasks(), []);
  const activeTab =
    resolveActiveTask(tasks, searchParams.get(ASSETS_TAB_QUERY_KEY), DEFAULT_ASSETS_TAB) ??
    DEFAULT_ASSETS_TAB;

  const handleSelectTask = useCallback(
    (nextTab: string) => {
      setSearchParams(
        (previousParams) => {
          const nextParams = new URLSearchParams(previousParams);
          nextParams.set(ASSETS_TAB_QUERY_KEY, nextTab);
          return nextParams;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const taskPanels: Record<string, JSX.Element> = {
    [ASSETS_TAB_KEYS.fixedAssets]: <FixedAssetsPanel />,
    [ASSETS_TAB_KEYS.aging]: <AgingPanel />,
    [ASSETS_TAB_KEYS.recurring]: <RecurringVouchersPanel />
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <ProPageBanner
        pageName="资产与往来"
        plain="公司的设备折旧、客户欠款账龄、每月固定要记的凭证都在这里。财务每月做一次，您不需要点任何按钮。"
      />
      <PageHeader
        title={getAssetsTabTitle(activeTab)}
        subtitle="资产与往来：固定资产、往来账龄、定期凭证收纳于一处，一次处理一件。"
      />
      <TaskFocusShell
        tasks={tasks}
        activeKey={activeTab}
        onSelectTask={handleSelectTask}
        switcherLabel="资产与往来当前要做的事"
      >
        {taskPanels[activeTab] ?? null}
      </TaskFocusShell>
    </div>
  );
}
