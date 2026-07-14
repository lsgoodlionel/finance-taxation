/**
 * 系统中心页面（G2 聚合）
 * 路由：/settings（承载原 /settings、/billing、/feedback 三个页面）
 * 功能：
 *   - 用 Tab 承载「系统设置 / 订阅计费 / 反馈与升级」三个既有页面
 *   - Tab 切换与 URL 查询参数（?tab=）双向同步，支持深链
 *   - 不改三个子页面内部逻辑，仅作为容器复用
 *   - 外层 URL 参数固定使用 `tab`；SettingsPage 内部自有一套 Tab 状态（公司/AI/
 *     开放 API/治理等），二者互不干扰，无需额外命名规避
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { PageHeader } from "../../components/ui/PageHeader";
import { SettingsPage } from "../SettingsPage";
import { BillingPage } from "../BillingPage";
import { FeedbackPage } from "../FeedbackPage";

const TAB_PARAM_KEY = "tab";

const SYSTEM_TAB_KEYS = ["settings", "billing", "feedback"] as const;

type SystemTabKey = (typeof SYSTEM_TAB_KEYS)[number];

const DEFAULT_TAB: SystemTabKey = "settings";

function isSystemTabKey(value: string | null): value is SystemTabKey {
  return value !== null && (SYSTEM_TAB_KEYS as readonly string[]).includes(value);
}

export function SystemHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo<SystemTabKey>(() => {
    const rawTab = searchParams.get(TAB_PARAM_KEY);
    return isSystemTabKey(rawTab) ? rawTab : DEFAULT_TAB;
  }, [searchParams]);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      setSearchParams(
        (previousParams) => {
          const nextParams = new URLSearchParams(previousParams);
          nextParams.set(TAB_PARAM_KEY, nextTab);
          return nextParams;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const items: TabsProps["items"] = [
    {
      key: "settings",
      label: "系统设置",
      children: <SettingsPage />
    },
    {
      key: "billing",
      label: "订阅计费",
      children: <BillingPage />
    },
    {
      key: "feedback",
      label: "反馈与升级",
      children: <FeedbackPage />
    }
  ];

  return (
    <div>
      <PageHeader
        title="系统中心"
        subtitle="系统设置、订阅计费、反馈与升级收纳于一处，按需切换查看与处理。"
      />
      <Tabs activeKey={activeTab} items={items} onChange={handleTabChange} />
    </div>
  );
}
