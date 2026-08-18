/**
 * 费控配置（V13 残留 1 + 2）。
 *
 * 费用标准与审批流合成一个 Tab，而不是给系统中心各加一个——两者都是
 * 「费控制度怎么定」的配置，放一起用户找得到；分开会让系统中心的 Tab
 * 从 3 个涨到 5 个，而其中两个是同一类事。
 */

import React, { useState } from "react";
import { Tabs } from "antd";
import { ApprovalFlowsPanel } from "./ApprovalFlowsPanel";
import { ExpenseStandardsPanel } from "./ExpenseStandardsPanel";

export function ExpenseControlPanel() {
  const [tab, setTab] = useState("standards");

  return (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      items={[
        {
          key: "standards",
          label: "费用标准",
          children: <ExpenseStandardsPanel />
        },
        {
          key: "flows",
          label: "审批流程",
          children: <ApprovalFlowsPanel />
        }
      ]}
    />
  );
}
