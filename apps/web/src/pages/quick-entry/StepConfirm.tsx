/**
 * 第 2 步「确认」：白话摘要卡 + 内联可改字段 + 缺发票黄色提醒。
 * 字段沿用 events 6 字段模型，但标签全部白话；创建失败保留内容可重试。
 */
import React from "react";
import { Alert, Button, Card, Input, Select, Typography } from "antd";
import { QUICK_TYPE_OPTIONS, buildSummaryText, DEFAULT_DEPARTMENT } from "./entry-rules";
import { canSubmit } from "./wizard-state";
import type { QuickEntryController } from "./types";

const FIELD_STYLE: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={FIELD_STYLE}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      {children}
    </div>
  );
}

function ParseSourceHint({ controller }: { controller: QuickEntryController }) {
  if (controller.parseSource === "ai") {
    return <Typography.Text type="secondary">以下内容由 AI 识别，请核对后再确认。</Typography.Text>;
  }
  if (controller.parseSource === "local") {
    return (
      <Typography.Text type="secondary">
        AI 暂时不可用，已按文字内容初步整理，请补齐或修改后确认。
      </Typography.Text>
    );
  }
  return <Typography.Text type="secondary">请手动填写这笔账的基本信息。</Typography.Text>;
}

export function StepConfirm({ controller }: { controller: QuickEntryController }) {
  const { draft, updateDraft } = controller;
  const isReady = canSubmit(draft);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card size="small">
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {isReady ? buildSummaryText(draft) : "把下面几项补齐，就能记下这笔账"}
        </Typography.Title>
        <ParseSourceHint controller={controller} />
      </Card>

      {controller.missingItems.map((hint) => (
        <Alert key={hint} type="warning" showIcon message="缺发票提醒" description={hint} />
      ))}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="这是笔什么账？">
          <Select
            value={draft.type || undefined}
            placeholder="选一个最接近的"
            options={[...QUICK_TYPE_OPTIONS]}
            onChange={(value) => updateDraft({ type: value })}
          />
        </Field>
        <Field label="多少钱？（元）">
          <Input
            inputMode="decimal"
            value={draft.amount}
            placeholder="比如 800"
            onChange={(event) => updateDraft({ amount: event.target.value })}
          />
        </Field>
        <Field label="哪天发生的？">
          <input
            className="form-input"
            type="date"
            value={draft.occurredOn}
            onChange={(event) => updateDraft({ occurredOn: event.target.value })}
            aria-label="发生日期"
          />
        </Field>
        <Field label="对方是谁？（选填）">
          <Input
            value={draft.counterparty}
            placeholder="比如 远大公司"
            onChange={(event) => updateDraft({ counterparty: event.target.value })}
          />
        </Field>
        <Field label="哪个部门的事？（选填）">
          <Input
            value={draft.department}
            placeholder={`不填就算「${DEFAULT_DEPARTMENT}」`}
            onChange={(event) => updateDraft({ department: event.target.value })}
          />
        </Field>
        <Field label="补充说明（选填）">
          <Input.TextArea
            value={draft.note}
            rows={2}
            maxLength={500}
            onChange={(event) => updateDraft({ note: event.target.value })}
          />
        </Field>
        {controller.hasAttachment && controller.receiptFile ? (
          <Typography.Text type="secondary">
            已带票据：{controller.receiptFile.name}（记下后会自动存进单据中心）
            <Button type="link" size="small" onClick={controller.removeReceiptFile}>
              移除
            </Button>
          </Typography.Text>
        ) : null}
      </div>

      {controller.submitError ? (
        <Alert
          type="error"
          showIcon
          message="没记上，内容已帮您留着"
          description={`${controller.submitError}。检查网络后点下方按钮重试即可。`}
        />
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button size="large" onClick={controller.goBackToDescribe} disabled={controller.submitting}>
          上一步
        </Button>
        <Button
          type="primary"
          size="large"
          style={{ flex: 1, minWidth: 160 }}
          loading={controller.submitting}
          disabled={!isReady}
          onClick={() => void controller.submit()}
        >
          {controller.submitError ? "重试：确认记下" : "确认记下这笔账"}
        </Button>
      </div>
    </div>
  );
}
