import React from "react";
import { Alert, Col, Descriptions, Empty, Row, Space, Statistic, Typography } from "antd";
import type { SuperDeductionPackage } from "@finance-taxation/domain-model";
import type { RndProjectDetail } from "../../lib/api";
import { SUPER_DEDUCTION_EXTRA_MULTIPLE, computeExtraDeduction, parseAmount } from "./rnd-tasks";

const { Text } = Typography;

interface RndDeductionPanelProps {
  project: RndProjectDetail | null;
  /** 后端算好的资料包；未加载完成时为 null。 */
  deductionPackage: SuperDeductionPackage | null;
  packageError: string | null;
}

/**
 * 「核对加计扣除基数与资料」的工作区。
 *
 * 这一件事在改造前根本没有入口：基数只是详情卡里的一行数字，资料清单
 * （getRndSuperDeductionPackage）只有 /export-center 会调，研发页自己看不到。
 *
 * 页面上的每个数都来自后端，前端不再自算：基数取 summary.superDeductionEligibleBase
 * （= 费用化金额），可扣除总额取资料包的 suggestedDeductionAmount（= 基数 × 2）。
 * 改造前 KPI 卡和归集向导各自乘 0.75、还把资本化 × 0.6 算进基数，
 * 同一个项目在三个界面上能看到三个不同的数。
 */
export function RndDeductionPanel({ project, deductionPackage, packageError }: RndDeductionPanelProps) {
  if (!project) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="先在「挑一个研发项目」里选中一个项目，再回到这里核对基数。"
      />
    );
  }

  const eligibleBase = parseAmount(project.summary.superDeductionEligibleBase);
  const extraDeduction = computeExtraDeduction(eligibleBase);
  const conflicts = project.policyReview.conflicts;
  const guidance = project.policyReview.guidance;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Statistic
            title="可加计扣除基数"
            value={eligibleBase.toFixed(2)}
            prefix="¥"
            valueStyle={{ color: "#16a34a", fontSize: 22 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>只统计费用化支出，资本化部分不进基数</Text>
        </Col>
        <Col xs={24} sm={8}>
          <Statistic
            title={`可额外扣除（加计 ${SUPER_DEDUCTION_EXTRA_MULTIPLE * 100}%）`}
            value={extraDeduction.toFixed(2)}
            prefix="¥"
            valueStyle={{ fontSize: 22 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>在据实扣除之外还能多扣的部分</Text>
        </Col>
        <Col xs={24} sm={8}>
          <Statistic
            title="累计研发工时"
            value={parseAmount(project.summary.totalHours)}
            suffix="小时"
            valueStyle={{ fontSize: 22 }}
          />
          {/* 工时不参与基数计算，这里说清楚，免得用户以为工时少了会影响扣除额。 */}
          <Text type="secondary" style={{ fontSize: 12 }}>备查资料用，不参与基数计算</Text>
        </Col>
      </Row>

      {conflicts.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message="基数暂时不能直接用于申报"
          description={
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              {conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          }
        />
      ) : (
        <Alert type="success" showIcon message="未发现政策合规冲突" />
      )}

      {guidance.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>政策建议</Text>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {guidance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {packageError ? (
        <Alert type="error" showIcon message="资料清单没取到" description={packageError} />
      ) : deductionPackage ? (
        <Descriptions title="汇算清缴要备齐的资料" column={1} size="small" bordered>
          <Descriptions.Item label="资料清单">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              {deductionPackage.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Descriptions.Item>
          <Descriptions.Item label="税前可扣除合计">
            <Text strong>¥{parseAmount(deductionPackage.suggestedDeductionAmount).toLocaleString()}</Text>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              据实扣除 + 加计部分，与导出的资料包同源
            </Text>
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>正在取资料清单…</Text>
      )}

      <Alert
        type="info"
        showIcon
        message="最终加计扣除金额以年度汇算清缴时税务机关核定的数额为准，本页为台账口径的测算。"
      />
    </Space>
  );
}
