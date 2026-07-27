/**
 * K1 第一段「需要您处理的事」：按优先级取前 3 张白话审批卡，
 * 更多的收进「还有 N 件 →」链到 /inbox。
 *
 * 呈现诚实：待办来源（AI 草稿 / 收件箱）只要有一路没取到数据，就**不允许**渲染
 * 「今天没有需要您处理的事 / 都安排好了」——那会把接口故障说成事情都办完了。
 */
import React from "react";
import { Alert, Button, Skeleton, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import { ApprovalCard } from "../../components/ui/ApprovalCard";
import { EmptyState } from "../../components/ui/EmptyState";
import type { PendingCardModel } from "./home-helpers";

const { Title } = Typography;

export type PendingActing = { draftId: string; action: "approve" | "reject" } | null;

interface HomePendingSectionProps {
  loading: boolean;
  cards: readonly PendingCardModel[];
  remaining: number;
  acting: PendingActing;
  /** 待办来源接口是否有失败（草稿或收件箱任一路失败即为 true）。 */
  sourcesFailed?: boolean;
  onApprove: (draftId: string) => void;
  onReject: (draftId: string) => void;
  onRetry?: () => void;
}

const SOURCE_FAILED_TEXT = "暂时读取不到待办（可能是网络或权限问题），下面显示的可能不完整。";

/** AI 草稿的可见风险标记：借贷不平 / AI 低置信，避免用户在不知情下一键批准。 */
function DraftFlags({ card }: { card: PendingCardModel }) {
  if (card.kind !== "ai-draft") return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {card.balanced === false ? <Tag color="error">借贷不平</Tag> : null}
      {card.balanced === null || card.balanced === undefined ? <Tag>借贷待校验</Tag> : null}
      {card.proposalLevel === "manual" ? <Tag color="warning">AI 没把握，请人工核对</Tag> : null}
    </span>
  );
}

export function HomePendingSection({
  loading,
  cards,
  remaining,
  acting,
  sourcesFailed = false,
  onApprove,
  onReject,
  onRetry
}: HomePendingSectionProps) {
  const retryButton = onRetry ? (
    <Button size="small" style={{ minHeight: 44 }} onClick={onRetry}>
      重新读取
    </Button>
  ) : null;

  function renderBody() {
    if (loading) {
      return <Skeleton active paragraph={{ rows: 4 }} />;
    }
    if (cards.length === 0 && sourcesFailed) {
      return (
        <EmptyState
          title="暂时读取不到待办"
          description="可能是网络或权限问题，这里显示的不代表没有待办事项。"
          action={retryButton ?? undefined}
        />
      );
    }
    if (cards.length === 0) {
      return (
        <EmptyState
          title="今天没有需要您处理的事"
          description="都安排好了。可以看看下面公司的经营情况，或问 AI 一个问题。"
          action={(
            <Link to="/dashboard/chairman">
              <Button style={{ minHeight: 44 }}>看看经营报告</Button>
            </Link>
          )}
        />
      );
    }
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {sourcesFailed ? (
          <Alert type="warning" showIcon message={SOURCE_FAILED_TEXT} action={retryButton} />
        ) : null}
        {cards.map((card) => (
          <ApprovalCard
            key={card.key}
            variant="guided"
            title={card.title}
            impact={card.impact}
            amount={card.amount}
            detailPath={card.detailPath}
            extra={<DraftFlags card={card} />}
            onApprove={card.draftId ? () => onApprove(card.draftId as string) : undefined}
            onReject={card.draftId ? () => onReject(card.draftId as string) : undefined}
            approving={Boolean(card.draftId && acting?.draftId === card.draftId && acting.action === "approve")}
            rejecting={Boolean(card.draftId && acting?.draftId === card.draftId && acting.action === "reject")}
          />
        ))}
        {remaining > 0 ? (
          <Link to="/inbox" style={{ justifySelf: "start" }}>
            <Button type="link" style={{ minHeight: 44, paddingLeft: 4, fontSize: 14 }}>
              还有 {remaining} 件 →
            </Button>
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <section className="v3-section-shell" data-tone="accent" aria-label="需要您处理的事">
      <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>需要您处理的事</Title>
      {renderBody()}
    </section>
  );
}
