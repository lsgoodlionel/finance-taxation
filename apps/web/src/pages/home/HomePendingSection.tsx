/**
 * K1 第一段「需要您处理的事」：按优先级取前 3 张白话审批卡，
 * 更多的收进「还有 N 件 →」链到 /inbox。
 */
import React from "react";
import { Button, Skeleton, Typography } from "antd";
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
  onApprove: (draftId: string) => void;
  onReject: (draftId: string) => void;
}

export function HomePendingSection({ loading, cards, remaining, acting, onApprove, onReject }: HomePendingSectionProps) {
  return (
    <section className="v3-section-shell" data-tone="accent" aria-label="需要您处理的事">
      <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>需要您处理的事</Title>

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : cards.length === 0 ? (
        <EmptyState
          title="今天没有需要您处理的事"
          description="都安排好了。可以看看下面公司的经营情况，或问 AI 一个问题。"
          action={(
            <Link to="/dashboard/chairman">
              <Button style={{ minHeight: 44 }}>看看经营报告</Button>
            </Link>
          )}
        />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {cards.map((card) => (
            <ApprovalCard
              key={card.key}
              variant="guided"
              title={card.title}
              impact={card.impact}
              amount={card.amount}
              detailPath={card.detailPath}
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
      )}
    </section>
  );
}
