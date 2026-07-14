/**
 * 合同与往来页面（G2 聚合）
 * 路由：/contracts
 * 功能：
 *   - 用 Tab 承载「合同管理 / 往来单位」两个既有页面
 *   - Tab 切换与 URL 查询参数（?tab=）双向同步，支持深链
 *   - 不改两个子页面内部逻辑，仅作为容器复用
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { PageHeader } from "../../components/ui/PageHeader";
import { ContractsPage } from "../ContractsPage";
import { CounterpartiesPage } from "../CounterpartiesPage";

const TAB_PARAM_KEY = "tab";

const CONTRACTS_TAB_KEYS = ["contracts", "counterparties"] as const;

type ContractsTabKey = (typeof CONTRACTS_TAB_KEYS)[number];

const DEFAULT_TAB: ContractsTabKey = "contracts";

function isContractsTabKey(value: string | null): value is ContractsTabKey {
  return value !== null && (CONTRACTS_TAB_KEYS as readonly string[]).includes(value);
}

export function ContractsDomainPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo<ContractsTabKey>(() => {
    const rawTab = searchParams.get(TAB_PARAM_KEY);
    return isContractsTabKey(rawTab) ? rawTab : DEFAULT_TAB;
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
      key: "contracts",
      label: "合同管理",
      children: <ContractsPage />
    },
    {
      key: "counterparties",
      label: "往来单位",
      children: <CounterpartiesPage />
    }
  ];

  return (
    <div>
      <PageHeader
        title="合同与往来"
        subtitle="合同全生命周期管理与客户/供应商往来档案，收纳于一处，按需切换查看与处理。"
      />
      <Tabs activeKey={activeTab} items={items} onChange={handleTabChange} />
    </div>
  );
}
