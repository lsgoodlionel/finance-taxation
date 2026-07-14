/**
 * AI 自动化治理面板（F4）
 * 嵌入 SettingsPage「AI 自动化治理」Tab
 *
 * 只读展示分级自动化的三项阈值：autoMin / suggestMin / financialCapCents。
 * 阈值本身由后端裁定引擎维护，本页不提供编辑入口。
 */
import { useState, useEffect } from "react";
import { Card, Space, Typography, Row, Col, Statistic, Alert, Tag, Spin } from "antd";
import {
  SafetyCertificateOutlined, CheckCircleOutlined, BulbOutlined,
  StopOutlined, LockOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import { getAutomationThresholds, type AutomationThresholds } from "../../lib/api";

const { Text } = Typography;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatYuan(cents: number): string {
  return `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LEVEL_META = [
  {
    key: "auto",
    icon: <CheckCircleOutlined />,
    color: "#16a34a",
    title: "auto · 可自动执行",
    desc: "置信度达到或超过「自动执行下限」，且非财务变更或金额未超上限时，系统直接执行，无需人工确认。",
  },
  {
    key: "suggest",
    icon: <BulbOutlined />,
    color: "#d97706",
    title: "suggest · 建议采纳",
    desc: "置信度介于「建议下限」与「自动执行下限」之间，系统给出建议供人工一键采纳或修改。",
  },
  {
    key: "manual",
    icon: <StopOutlined />,
    color: "#dc2626",
    title: "manual · 需人工处理",
    desc: "置信度低于「建议下限」，或触发金额上限等硬性限制，必须由人工完成全部判断与操作。",
  },
];

export function AutomationGovernanceTab() {
  const [thresholds, setThresholds] = useState<AutomationThresholds | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getAutomationThresholds()
      .then(setThresholds)
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>;

  if (!thresholds) {
    return <Alert type="error" showIcon message="加载自动化阈值失败" />;
  }

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Card
        title={<Space><SafetyCertificateOutlined style={{ color: "#7c3aed" }} /><Text strong>当前分级阈值</Text></Space>}
        style={{ borderRadius: 10 }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Statistic
              title="自动执行置信度下限（autoMin）"
              value={formatPercent(thresholds.autoMin)}
              valueStyle={{ color: "#16a34a", fontSize: 22 }}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title="建议采纳置信度下限（suggestMin）"
              value={formatPercent(thresholds.suggestMin)}
              valueStyle={{ color: "#d97706", fontSize: 22 }}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title="财务变更强制人工上限"
              value={formatYuan(thresholds.financialCapCents)}
              valueStyle={{ color: "#dc2626", fontSize: 22 }}
            />
          </Col>
        </Row>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 12 }}>
          阈值由系统裁定引擎统一维护，当前页面仅供查看，如需调整请联系系统管理员。
        </Text>
      </Card>

      <Card
        title={<Space><BulbOutlined style={{ color: "#2563eb" }} /><Text strong>分级说明</Text></Space>}
        style={{ borderRadius: 10 }}
      >
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {LEVEL_META.map((lvl) => (
            <div key={lvl.key} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Tag color={lvl.key === "auto" ? "success" : lvl.key === "suggest" ? "warning" : "error"} style={{ marginTop: 2 }}>
                <Space size={4}>{lvl.icon}{lvl.title}</Space>
              </Tag>
              <Text style={{ fontSize: 13, flex: 1 }}>{lvl.desc}</Text>
            </div>
          ))}
        </Space>
      </Card>

      <Alert
        type="warning"
        showIcon
        icon={<LockOutlined />}
        message="硬校验绝不交给 AI"
        description="金额核对、借贷平衡等硬性财务校验始终由系统规则引擎执行，不受置信度分级影响，也不会因 AI 判断而绕过或放宽。AI 仅负责在硬校验通过的前提下辅助判断执行等级。"
      />
    </Space>
  );
}
