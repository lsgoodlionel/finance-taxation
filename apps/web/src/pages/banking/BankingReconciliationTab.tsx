/**
 * 银行「智能对账」这一步的工作区：左边定规则，右边跑匹配、认候选。
 *
 * 从 BankingPage 抽出来的原因：那个文件已经 500 行，而这一步本身是自成一体的
 * 「配置 + 运行 + 人工复核」三段，抽走后主文件只剩「导入 / 看流水 / 管账户」的骨架。
 * 状态仍由 BankingPage 持有——确认候选后要连带刷新流水与统计，状态留在一处才不会分叉。
 */
import React from "react";
import { Alert, Button, Card, Col, Divider, Empty, Form, InputNumber, Row, Space, Statistic, Table, Typography } from "antd";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import { RobotOutlined, SettingOutlined } from "@ant-design/icons";
import type { ReconciliationCandidate } from "../../lib/api";

const { Text } = Typography;

export type BankingReconciliationTabProps = {
  rulesForm: FormInstance;
  candidates: ReconciliationCandidate[];
  candidateColumns: ColumnsType<ReconciliationCandidate>;
  unmatchedCount: number;
  pendingCandidateCount: number;
  autoCount: number;
  savingRules: boolean;
  running: boolean;
  onSaveRules: () => void;
  onRunReconciliation: () => void;
};

const MAX_DATE_WINDOW_DAYS = 30;
const MIN_AUTO_CONFIRM_SCORE = 50;
const MAX_AUTO_CONFIRM_SCORE = 100;

export function BankingReconciliationTab({
  rulesForm,
  candidates,
  candidateColumns,
  unmatchedCount,
  pendingCandidateCount,
  autoCount,
  savingRules,
  running,
  onSaveRules,
  onRunReconciliation
}: BankingReconciliationTabProps) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="系统按金额、日期、摘要关键词和对方名称对银行流水与已过账凭证进行匹配。高分会自动确认，中分进入人工复核。"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            title={<Space><SettingOutlined />对账规则</Space>}
            extra={<Button type="primary" loading={savingRules} onClick={onSaveRules}>保存规则</Button>}
          >
            <Form form={rulesForm} layout="vertical">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="amountTolerance" label="金额容差（元）" rules={[{ required: true }]}>
                    <InputNumber min={0} step={0.01} precision={2} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="dateWindowDays" label="日期窗口（天）" rules={[{ required: true }]}>
                    <InputNumber min={0} max={MAX_DATE_WINDOW_DAYS} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="autoConfirmThreshold" label="自动确认阈值" rules={[{ required: true }]}>
                    <InputNumber min={MIN_AUTO_CONFIRM_SCORE} max={MAX_AUTO_CONFIRM_SCORE} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="unmatchedEventDays" label="未匹配转事项（天）" rules={[{ required: true }]}>
                    <InputNumber min={1} max={MAX_DATE_WINDOW_DAYS} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12 }}>
                当前关键词权重使用系统配置。后续如需可视化编辑，再单独展开。
              </Text>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            title={<Space><RobotOutlined />对账工作台</Space>}
            extra={<Button type="primary" loading={running} onClick={onRunReconciliation}>运行智能对账</Button>}
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Row gutter={[12, 12]}>
                <Col span={8}><Statistic title="未匹配流水" value={unmatchedCount} /></Col>
                <Col span={8}><Statistic title="待人工确认" value={pendingCandidateCount} /></Col>
                <Col span={8}><Statistic title="自动匹配" value={autoCount} /></Col>
              </Row>
              <Divider style={{ margin: "4px 0 0" }} />
              <Table
                dataSource={candidates}
                columns={candidateColumns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                scroll={{ x: 1100 }}
                locale={{ emptyText: <Empty description="暂无待确认候选，点击“运行智能对账”开始匹配" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              />
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
