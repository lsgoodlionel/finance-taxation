/**
 * 工资域页面（G4 聚合）
 * 路由：/payroll
 * 功能：
 *   - 用 Tab 承载「工资管理 / 代发与社保」两个既有页面
 *   - Tab 切换与 URL 查询参数（?tab=）双向同步，支持深链
 *   - 不改两个子页面内部逻辑，仅作为容器复用
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { PageHeader } from "../../components/ui/PageHeader";
import { PayrollPage } from "../PayrollPage";
import { PayrollTransferPage } from "../PayrollTransferPage";

const TAB_PARAM_KEY = "tab";

const PAYROLL_DOMAIN_TAB_KEYS = ["manage", "transfer"] as const;

type PayrollDomainTabKey = (typeof PAYROLL_DOMAIN_TAB_KEYS)[number];

const DEFAULT_TAB: PayrollDomainTabKey = "manage";

function isPayrollDomainTabKey(value: string | null): value is PayrollDomainTabKey {
  return value !== null && (PAYROLL_DOMAIN_TAB_KEYS as readonly string[]).includes(value);
}

export function PayrollDomainPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo<PayrollDomainTabKey>(() => {
    const rawTab = searchParams.get(TAB_PARAM_KEY);
    return isPayrollDomainTabKey(rawTab) ? rawTab : DEFAULT_TAB;
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
      key: "manage",
      label: "工资管理",
      children: <PayrollPage />
    },
    {
      key: "transfer",
      label: "代发与社保",
      children: <PayrollTransferPage />
    }
  ];

  return (
    <div>
      <PageHeader
        title="工资域"
        subtitle="工资管理与代发、社保关账收纳于一处，按需切换查看与处理。"
      />
      <Tabs activeKey={activeTab} items={items} onChange={handleTabChange} />
    </div>
  );
}
