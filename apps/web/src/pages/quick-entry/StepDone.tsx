/**
 * 第 3 步「完成」：白话总结 + 三个去向按钮（再记一笔 / 回今日 / 看这笔的进展）。
 *
 * 呈现诚实：只有草稿**确实生成成功**才说「已生成分录草稿」；失败或 0 条时改用中性
 * 说法。缺发票提醒保留，但不承诺「系统会主动提醒补传」（该提醒后端尚未实现）。
 */
import React from "react";
import { Alert, Button, Result, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { Term } from "../../components/ui/Term";
import type { QuickEntryController } from "./types";

export function StepDone({ controller }: { controller: QuickEntryController }) {
  const navigate = useNavigate();
  const result = controller.result;
  if (!result) {
    return <Alert type="info" showIcon message="这笔账还没记完，请回到上一步确认。" />;
  }

  return (
    <Result
      status="success"
      title="已记下！"
      subTitle={(
        <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
          {result.draftStatus === "generated" ? (
            <Typography.Text>
              接下来：财务会把它记进账本（我们已经生成了
              <Term k="journal-entry" />
              草稿，供财务确认），您不用再做别的。
            </Typography.Text>
          ) : (
            <Typography.Text>
              接下来：财务会为这笔安排入账，您不用再做别的。
            </Typography.Text>
          )}
          {result.taskCount > 0 ? (
            <Typography.Text>
              系统还自动列了 {result.taskCount} 件后续小事（比如补材料），会有人跟进。
            </Typography.Text>
          ) : null}
          {result.missingInvoice ? (
            <Typography.Text type="warning">
              这笔支出还缺发票，记得拿到发票后到单据中心补传，补上才能税前扣除。
            </Typography.Text>
          ) : null}
          {result.uploadWarning ? (
            <Typography.Text type="warning">{result.uploadWarning}</Typography.Text>
          ) : null}
        </div>
      )}
      extra={(
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Button type="primary" size="large" onClick={controller.reset}>
            再记一笔
          </Button>
          <Button size="large" onClick={() => navigate("/home")}>
            回今日
          </Button>
          <Button size="large" onClick={() => navigate(`/events?event=${result.eventId}`)}>
            看这笔的进展
          </Button>
        </div>
      )}
    />
  );
}
