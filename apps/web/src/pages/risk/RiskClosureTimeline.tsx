import { Timeline, Typography, Empty, Tag } from "antd";
import { CheckCircleOutlined, UserOutlined } from "@ant-design/icons";
import type { RiskClosureRecord } from "@finance-taxation/domain-model";

const { Text } = Typography;

type RiskClosureTimelineProps = {
  selectedFindingId: string;
  records: RiskClosureRecord[];
};

export function RiskClosureTimeline({ selectedFindingId, records }: RiskClosureTimelineProps) {
  const timelineItems = records.map((record) => ({
    key: record.id,
    color: "green",
    dot: <CheckCircleOutlined style={{ color: "#16a34a", fontSize: 14 }} />,
    children: (
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Tag icon={<UserOutlined />} color="default" style={{ fontSize: 11 }}>
            {record.closedByName || "未知操作人"}
          </Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.reviewedAt?.slice(0, 16).replace("T", " ") ?? "—"}
          </Text>
        </div>
        <Text style={{ fontSize: 13 }}>{record.resolution}</Text>
        <Text type="secondary" style={{ fontSize: 10 }}>#{record.id.slice(-8).toUpperCase()}</Text>
      </div>
    ),
  }));

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.82)",
        borderRadius: 24,
        border: "1px solid rgba(20,40,60,0.08)",
        padding: 24,
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>
        关闭与复盘记录
        {selectedFindingId && (
          <Text type="secondary" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
            #{selectedFindingId.slice(-8).toUpperCase()}
          </Text>
        )}
      </h3>
      {records.length === 0 ? (
        <Empty
          description={
            selectedFindingId
              ? "当前风险发现暂无关闭记录"
              : "请先在左侧选择一条风险发现"
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Timeline items={timelineItems} />
      )}
    </div>
  );
}
