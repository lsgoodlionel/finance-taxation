import { Skeleton, Card, Row, Col } from "antd";

type PageSkeletonVariant = "list" | "detail" | "dashboard" | "form";

interface Props {
  variant?: PageSkeletonVariant;
  rows?: number;
}

/** Shared skeleton loading placeholder for page-level loading states */
export function PageSkeleton({ variant = "list", rows = 5 }: Props) {
  if (variant === "dashboard") {
    return (
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
    );
  }

  if (variant === "detail") {
    return (
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
    );
  }

  if (variant === "form") {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: rows }} title={{ width: 200 }} />
      </Card>
    );
  }

  // Default: list variant
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Skeleton active paragraph={{ rows: 1 }} title={{ width: 220 }} />
      <Card>
        <Skeleton active paragraph={{ rows: rows }} />
      </Card>
    </div>
  );
}
