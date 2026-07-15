/**
 * K1 第三段「问 AI / 快捷场景」：常驻输入框直达 /assistant（携带 initialPrompt），
 * 旁边 4 张场景卡覆盖高频动作。
 */
import React, { useState } from "react";
import { Button, Input, Typography } from "antd";
import {
  CameraOutlined,
  EditOutlined,
  FileTextOutlined,
  SendOutlined,
  TeamOutlined
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

interface SceneCardModel {
  key: string;
  label: string;
  hint: string;
  path: string;
  icon: React.ReactNode;
}

const SCENE_CARDS: readonly SceneCardModel[] = [
  { key: "quick-entry", label: "记一笔", hint: "花了钱、收了钱，说一句就行", path: "/quick-entry", icon: <EditOutlined /> },
  { key: "bills", label: "传票据", hint: "拍照或上传发票、回单", path: "/bills", icon: <CameraOutlined /> },
  { key: "reports", label: "看报告", hint: "公司经营情况白话讲给您听", path: "/reports", icon: <FileTextOutlined /> },
  { key: "payroll", label: "发工资进展", hint: "这个月工资发到哪一步了", path: "/payroll", icon: <TeamOutlined /> }
];

export function HomeAskSection() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");

  const submit = () => {
    const prompt = question.trim();
    if (!prompt) return;
    navigate("/assistant", { state: { initialPrompt: prompt } });
  };

  return (
    <section className="v3-section-shell" data-tone="muted" aria-label="问 AI 与快捷场景">
      <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>想知道什么，直接问</Title>

      <div style={{ display: "flex", gap: 8 }}>
        <Input
          size="large"
          value={question}
          placeholder="问点什么，比如：这个月钱花哪了？"
          style={{ minHeight: 44, borderRadius: 10 }}
          onChange={(e) => setQuestion(e.target.value)}
          onPressEnter={submit}
          aria-label="向 AI 提问"
        />
        <Button
          type="primary"
          size="large"
          icon={<SendOutlined />}
          style={{ minHeight: 44, borderRadius: 10 }}
          disabled={!question.trim()}
          onClick={submit}
        >
          问 AI
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          marginTop: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))"
        }}
      >
        {SCENE_CARDS.map((card) => (
          <Link
            key={card.key}
            to={card.path}
            style={{
              display: "grid",
              gap: 4,
              padding: "14px 16px",
              minHeight: 44,
              borderRadius: 12,
              border: "1px solid rgba(20,40,60,0.08)",
              background: "rgba(255,255,255,0.92)",
              color: "inherit"
            }}
          >
            <span style={{ fontSize: 18, color: "#2563eb" }}>{card.icon}</span>
            <Text strong style={{ fontSize: 15 }}>{card.label}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{card.hint}</Text>
          </Link>
        ))}
      </div>
    </section>
  );
}
