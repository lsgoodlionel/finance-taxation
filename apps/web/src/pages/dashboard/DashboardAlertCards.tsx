import { Row, Col, Card, List, Tag, Typography, Empty } from "antd";
import {
  WarningOutlined, ClockCircleOutlined, FileTextOutlined, SafetyOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import type { DashboardData } from "../../lib/api";
import { Term } from "../../components/ui/Term";

const { Text } = Typography;

interface AlertSection {
  key: string;
  title: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  items: DashboardData["riskBoard"]["approvals"];
}

interface DashboardAlertCardsProps {
  riskBoard: DashboardData["riskBoard"];
  queues: DashboardData["queues"];
}

export function DashboardAlertCards({ riskBoard, queues }: DashboardAlertCardsProps) {
  const sections: AlertSection[] = [
    {
      key: "approvals",
      title: <>待审批<Term k="voucher">凭证</Term>（{queues.approvals}）</>,
      icon: <FileTextOutlined />,
      color: "#d97706",
      borderColor: "#fde68a",
      items: riskBoard.approvals,
    },
    {
      key: "blocked",
      title: `阻塞任务（${queues.blockedTasks}）`,
      icon: <WarningOutlined />,
      color: "#dc2626",
      borderColor: "#fecaca",
      items: riskBoard.blockedTasks,
    },
    {
      key: "overdue",
      title: `逾期任务（${queues.overdueTasks}）`,
      icon: <ClockCircleOutlined />,
      color: "#7c3aed",
      borderColor: "#ddd6fe",
      items: riskBoard.overdueTasks,
    },
    {
      key: "risk",
      title: `风险事项`,
      icon: <SafetyOutlined />,
      color: "#0284c7",
      borderColor: "#bae6fd",
      items: riskBoard.riskEvents,
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      {sections.map(section => (
        <Col key={section.key} xs={24} sm={12} lg={6}>
          <Card
            size="small"
            title={
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: section.color }}>{section.icon}</span>
                <Text strong style={{ fontSize: 12 }}>{section.title}</Text>
              </div>
            }
            style={{
              borderRadius: 10,
              borderColor: section.borderColor,
              height: "100%",
            }}
            styles={{ body: { padding: "8px 12px" } }}
          >
            {section.items.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary" style={{ fontSize: 11 }}>无待处理项</Text>}
                style={{ margin: "8px 0" }}
              />
            ) : (
              <List
                size="small"
                dataSource={section.items.slice(0, 4)}
                renderItem={item => (
                  <List.Item style={{ padding: "4px 0", borderBottom: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8 }}>
                      <Link to={item.route} style={{ fontSize: 12, color: "#2563eb", textDecoration: "none",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {item.title}
                      </Link>
                      <Tag
                        color={
                          item.severity === "high"   ? "error" :
                          item.severity === "medium" ? "warning" : "default"
                        }
                        style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", flexShrink: 0 }}
                      >
                        {item.status}
                      </Tag>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      ))}
    </Row>
  );
}
