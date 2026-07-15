/**
 * 第 3 步「完成」：白话总结 + 三个去向按钮（再记一笔 / 回今日 / 看这笔的进展）。
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
          <Typography.Text>
            接下来：财务会把它记进账本（我们已经生成了
            <Term k="journal-entry" />
            草稿，供财务确认），您不用再做别的。
          </Typography.Text>
          {result.taskCount > 0 ? (
            <Typography.Text>
              系统还自动列了 {result.taskCount} 件后续小事（比如补材料），会有人跟进。
            </Typography.Text>
          ) : null}
          {result.missingInvoice ? (
            <Typography.Text type="warning">
              这笔支出还缺发票，拿到发票后我们会提醒您补传，补上才能税前扣除。
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
