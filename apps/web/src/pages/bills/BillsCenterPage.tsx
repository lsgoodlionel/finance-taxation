/**
 * 票据中心页面（G2 聚合）
 * 路由：/bills
 * 功能：
 *   - 用 Tab 承载「单据 / 发票 / 银行」三个既有页面
 *   - Tab 切换与 URL 查询参数（?tab=）双向同步，支持深链
 *   - 不改三个子页面内部逻辑，仅作为容器复用
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { PageHeader } from "../../components/ui/PageHeader";
import { DocumentsPage } from "../DocumentsPage";
import { InvoicesPage } from "../invoices/InvoicesPage";
import { BankingPage } from "../banking/BankingPage";

const TAB_PARAM_KEY = "tab";

const BILLS_TAB_KEYS = ["documents", "invoices", "banking"] as const;

type BillsTabKey = (typeof BILLS_TAB_KEYS)[number];

const DEFAULT_TAB: BillsTabKey = "documents";

function isBillsTabKey(value: string | null): value is BillsTabKey {
  return value !== null && (BILLS_TAB_KEYS as readonly string[]).includes(value);
}

export function BillsCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo<BillsTabKey>(() => {
    const rawTab = searchParams.get(TAB_PARAM_KEY);
    return isBillsTabKey(rawTab) ? rawTab : DEFAULT_TAB;
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
      key: "documents",
      label: "单据",
      children: <DocumentsPage />
    },
    {
      key: "invoices",
      label: "发票",
      children: <InvoicesPage />
    },
    {
      key: "banking",
      label: "银行",
      children: <BankingPage />
    }
  ];

  return (
    <div>
      <PageHeader
        title="票据中心"
        subtitle="票据收件箱：单据、发票、银行流水收纳于一处，按需切换查看与处理。"
      />
      <Tabs activeKey={activeTab} items={items} onChange={handleTabChange} />
    </div>
  );
}
