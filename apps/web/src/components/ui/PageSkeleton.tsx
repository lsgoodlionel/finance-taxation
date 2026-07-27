import React, { type ReactNode } from "react";
import { Skeleton, Card, Row, Col } from "antd";

type PageSkeletonVariant = "list" | "detail" | "dashboard" | "form";

interface Props {
  variant?: PageSkeletonVariant;
  rows?: number;
}

/** 内容加载中包裹层：antd Skeleton 本身不播报状态，用 role="status" 补上 a11y 语义。 */
function LoadingRegion({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-label="页面内容加载中">
      {children}
    </div>
  );
}

/** Shared skeleton loading placeholder for page-level loading states */
export function PageSkeleton({ variant = "list", rows = 5 }: Props) {
  if (variant === "dashboard") {
    return (
      <LoadingRegion>
        <div style={{ display: "grid", gap: 24 }}>
          {/* Header skeleton */}
          <Skeleton active paragraph={{ rows: 1 }} title={{ width: 240 }} />
          {/* KPI card row */}
          <Row gutter={[16, 16]}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Col xs={24} sm={12} md={6} key={i}>
                <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
                  <Skeleton active paragraph={{ rows: 1 }} title={{ width: 80 }} />
                </Card>
              </Col>
            ))}
          </Row>
          {/* Content area */}
          <Card>
            <Skeleton active paragraph={{ rows: rows }} />
          </Card>
        </div>
      </LoadingRegion>
    );
  }

  if (variant === "detail") {
    return (
      <LoadingRegion>
        <div style={{ display: "grid", gap: 24 }}>
          <Skeleton active paragraph={{ rows: 2 }} title={{ width: 300 }} />
          <Row gutter={[24, 24]}>
            <Col xs={24} md={14}>
              <Card>
                <Skeleton active paragraph={{ rows: rows }} />
              </Card>
            </Col>
            <Col xs={24} md={10}>
              <Card>
                <Skeleton active paragraph={{ rows: Math.floor(rows / 2) }} />
              </Card>
            </Col>
          </Row>
        </div>
      </LoadingRegion>
    );
  }

  if (variant === "form") {
    return (
      <LoadingRegion>
        <Card>
          <Skeleton active paragraph={{ rows: rows }} title={{ width: 200 }} />
        </Card>
      </LoadingRegion>
    );
  }

  // Default: list variant
  return (
    <LoadingRegion>
      <div style={{ display: "grid", gap: 24 }}>
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: 220 }} />
        <Card>
          <Skeleton active paragraph={{ rows: rows }} />
        </Card>
      </div>
    </LoadingRegion>
  );
}
