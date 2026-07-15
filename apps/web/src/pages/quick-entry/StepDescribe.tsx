/**
 * 第 1 步「说清楚发生了什么」：上传/拍照票据 或 一句白话描述（Tab 切换）。
 * 识别失败时引导改用文字描述，并提供「跳过识别，手动填写」降级出口。
 */
import React, { useRef } from "react";
import { Alert, Button, Input, Tabs, Typography } from "antd";
import type { QuickEntryController } from "./types";

const ACCEPTED_FILE_TYPES = "image/*,application/pdf";
const TEXT_PLACEHOLDER = "比如：昨天请客户吃饭花了 800";
const TEXT_EXAMPLES = [
  "上周三坐高铁去上海出差，来回 1,240 元",
  "给办公室买了台电脑，8,500 元，供应商联想",
  "收到客户远大公司的合同款 3 万"
];

function UploadPane({ controller }: { controller: QuickEntryController }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void controller.analyzeReceipt(file);
    }
    event.target.value = "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        style={{ display: "none" }}
        onChange={handleFileChange}
        aria-label="上传票据文件"
      />
      <Button
        type="primary"
        size="large"
        block
        loading={controller.parsing}
        onClick={() => fileInputRef.current?.click()}
      >
        {controller.parsing ? "正在识别票据…" : "拍照 / 上传票据（图片或 PDF）"}
      </Button>
      <Typography.Text type="secondary">
        发票、收据、付款回单都可以。上传后 AI 会自动认出金额、日期和对方单位，您只需确认。
      </Typography.Text>
      {controller.receiptFile && !controller.parsing ? (
        <Typography.Text>已选文件：{controller.receiptFile.name}</Typography.Text>
      ) : null}
    </div>
  );
}

function TextPane({ controller }: { controller: QuickEntryController }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input.TextArea
        value={controller.textInput}
        onChange={(event) => controller.setTextInput(event.target.value)}
        placeholder={TEXT_PLACEHOLDER}
        rows={3}
        maxLength={500}
        disabled={controller.parsing}
      />
      <Typography.Text type="secondary">
        像发微信一样说就行，例如：{TEXT_EXAMPLES.join("；")}。
      </Typography.Text>
      <Button
        type="primary"
        size="large"
        block
        loading={controller.parsing}
        disabled={!controller.textInput.trim()}
        onClick={() => void controller.analyzeText()}
      >
        下一步：帮我认出金额和日期
      </Button>
    </div>
  );
}

export function StepDescribe({ controller }: { controller: QuickEntryController }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {controller.parseError ? (
        <Alert
          type="warning"
          showIcon
          message="没识别出来，换个方式试试"
          description={controller.parseError}
          action={(
            <Button size="small" onClick={controller.skipToManualConfirm}>
              跳过识别，手动填写
            </Button>
          )}
        />
      ) : null}
      <Tabs
        activeKey={controller.mode}
        onChange={(key) => controller.setMode(key === "text" ? "text" : "upload")}
        items={[
          { key: "upload", label: "拍照 / 传票据", children: <UploadPane controller={controller} /> },
          { key: "text", label: "打字描述", children: <TextPane controller={controller} /> }
        ]}
      />
      {controller.parsing ? (
        <Typography.Text type="secondary">AI 正在识别，通常几秒钟…</Typography.Text>
      ) : null}
    </div>
  );
}
