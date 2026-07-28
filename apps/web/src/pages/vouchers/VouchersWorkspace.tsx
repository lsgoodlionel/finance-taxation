import React from "react";
import { Row, Col, Card, Space, Typography, Skeleton } from "antd";
import type { Voucher } from "@finance-taxation/domain-model";
import type { VoucherDetail, WorkflowRunDetail } from "../../lib/api";
import { Term } from "../../components/ui/Term";
import { BatchBar } from "./BatchBar";
import { useVoucherBatch } from "./useVoucherBatch";
import { VouchersList } from "./VouchersList";
import { VoucherDetailPanel } from "./VoucherDetailPanel";
import type { VoucherTab } from "./voucher-actions";

const { Text } = Typography;

/**
 * 凭证中心的主工作区：左边挑一张，右边办这一张。
 *
 * 从 VouchersPage 拆出来只是为了让页面文件回到「状态 + 动作」的尺度；
 * 这里不持有任何状态，行为与拆分前完全一致（批量条、状态页签、快捷键提示、
 * 详情里的四个跳转出口都原样保留）。
 */

interface VouchersWorkspaceProps {
  loading: boolean;
  vouchers: Voucher[];
  selectedId: string | null;
  activeVoucherId: string | null;
  activeTab: VoucherTab;
  detail: VoucherDetail | null;
  runtimeDetail: WorkflowRunDetail | null;
  validation: { valid: boolean; totals: { debit: string; credit: string }; issues: string[] } | null;
  updating: boolean;
  /** 直接沿用 useVoucherBatch 的返回类型，避免这里再抄一份很快就会走样的形状。 */
  batch: ReturnType<typeof useVoucherBatch>;
  onTabChange: (tab: VoucherTab) => void;
  onSelect: (id: string) => void;
  onValidate: () => Promise<void>;
  onApprove: () => Promise<void>;
  onPost: () => Promise<void>;
  onSummaryUpdate: (summary: string) => Promise<void>;
  onOpenEvent: (businessEventId: string) => void;
  onOpenDocuments: (businessEventId: string) => void;
  onOpenTax: (businessEventId: string) => void;
  onOpenLedger: (voucherId: string, businessEventId: string) => void;
}

export function VouchersWorkspace(props: VouchersWorkspaceProps) {
  const { loading, batch } = props;

  if (loading) {
    return (
      <Card style={{ borderRadius: 12 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={13}>
        <Card
          title={<Space><Text strong>选一张<Term k="voucher">凭证</Term></Text></Space>}
          extra={(
            <Text type="secondary" style={{ fontSize: 11 }}>
              快捷键：j/k 移动 · Enter 打开 · x 勾选 · a 下一步
            </Text>
          )}
          style={{ borderRadius: 12 }}
          styles={{ body: { padding: "0 0 8px" } }}
        >
          <div style={{ padding: "8px 12px 0" }}>
            <BatchBar
              checkedCount={batch.checkedIds.length}
              approvableCount={batch.approvableCount}
              postableCount={batch.postableCount}
              running={batch.running}
              progress={batch.progress}
              onBatchApprove={batch.startBatchApprove}
              onBatchPost={batch.startBatchPost}
              onClear={batch.clearChecked}
            />
          </div>
          <VouchersList
            vouchers={props.vouchers}
            selectedId={props.selectedId}
            activeId={props.activeVoucherId}
            activeTab={props.activeTab}
            checkedIds={batch.checkedIds}
            onTabChange={props.onTabChange}
            onSelect={props.onSelect}
            onCheckedChange={batch.replaceChecked}
          />
        </Card>
      </Col>

      <Col xs={24} lg={11}>
        <Card style={{ borderRadius: 12 }}>
          <VoucherDetailPanel
            detail={props.detail}
            runtimeDetail={props.runtimeDetail}
            validation={props.validation}
            updating={props.updating}
            onValidate={props.onValidate}
            onApprove={props.onApprove}
            onPost={props.onPost}
            onSummaryUpdate={props.onSummaryUpdate}
            onOpenEvent={props.onOpenEvent}
            onOpenDocuments={props.onOpenDocuments}
            onOpenTax={props.onOpenTax}
            onOpenLedger={props.onOpenLedger}
          />
        </Card>
      </Col>
    </Row>
  );
}
