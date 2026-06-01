import { Drawer, Tabs, Tag, Typography, Descriptions, Timeline, Table, Space, Button, Empty } from "antd";
import {
  FileTextOutlined, HistoryOutlined, AlertOutlined, FolderOpenOutlined, InfoCircleOutlined,
  ClockCircleOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import type { Contract, Task, GeneratedDocument, TaxItem, Voucher } from "@finance-taxation/domain-model";

const { Text, Title } = Typography;

interface ContractDetailView {
  contract: Contract;
  relatedEvents: { id: string; title: string; status: string; createdAt: string }[];
  relatedTasks: Task[];
  relatedDocuments: GeneratedDocument[];
  relatedTaxItems: TaxItem[];
  relatedVouchers: Voucher[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", active: "执行中", fulfilled: "已履行", terminated: "已终止", expired: "已到期",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "#8a9bb0", active: "#1a7f5a", fulfilled: "#4a7fc4", terminated: "#c0392b", expired: "#b0890a",
};
const CONTRACT_TYPE_LABELS: Record<string, string> = {
  sales: "销售合同", procurement: "采购合同", lease: "租赁合同", service: "服务合同", other: "其他",
};

interface ContractDrawerProps {
  detail: ContractDetailView | null;
  open: boolean;
  onClose: () => void;
  onCloseContract: (status: "fulfilled" | "terminated") => void;
  onOpenEvent: (eventId: string) => void;
}

export function ContractDrawer({ detail, open, onClose, onCloseContract, onOpenEvent }: ContractDrawerProps) {
  if (!detail) return null;
  const { contract, relatedEvents, relatedTasks, relatedDocuments, relatedVouchers } = detail;

  const tabs = [
    {
      key: "info",
      label: <Space size={4}><InfoCircleOutlined />基本信息</Space>,
      children: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="合同编号" span={2}>
              <Text copyable>{contract.contractNo ?? "—"}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="合同类型">
              {CONTRACT_TYPE_LABELS[contract.contractType] ?? contract.contractType}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color="processing" style={{ background: `${STATUS_COLOR[contract.status]}15`, border: `1px solid ${STATUS_COLOR[contract.status]}40`, color: STATUS_COLOR[contract.status] }}>
                {STATUS_LABELS[contract.status] ?? contract.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="交易方" span={2}>{contract.counterpartyName}</Descriptions.Item>
            <Descriptions.Item label="金额">
              <Text strong>¥{contract.amount.toLocaleString()}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="货币">{contract.currency}</Descriptions.Item>
            <Descriptions.Item label="签订日期">{contract.signedDate ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="起始日期">{contract.startDate ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="到期日期">{contract.endDate ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>{contract.notes || "—"}</Descriptions.Item>
          </Descriptions>

          {(contract.status === "active" || contract.status === "draft") && (
            <Space>
              <Button size="small" onClick={() => onCloseContract("fulfilled")}>标记履约完成</Button>
              <Button size="small" danger ghost onClick={() => onCloseContract("terminated")}>终止合同</Button>
            </Space>
          )}
        </Space>
      ),
    },
    {
      key: "performance",
      label: <Space size={4}><HistoryOutlined />履行记录</Space>,
      children: (
        relatedEvents.length > 0 ? (
          <Timeline
            items={relatedEvents.map(event => ({
              dot: <ClockCircleOutlined style={{ color: "#2563eb" }} />,
              children: (
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>
                    <Button type="link" size="small" style={{ padding: 0, height: "auto" }}
                      onClick={() => onOpenEvent(event.id)}>
                      {event.title}
                    </Button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <Tag style={{ fontSize: 11 }}>{event.status}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>{event.createdAt.slice(0, 10)}</Text>
                  </div>
                </div>
              ),
            }))}
          />
        ) : (
          <Empty description="暂无履行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )
      ),
    },
    {
      key: "risk",
      label: <Space size={4}><AlertOutlined />风险勾稽</Space>,
      children: (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {relatedTasks.filter(t => t.status === "blocked").length > 0 ? (
            relatedTasks.filter(t => t.status === "blocked").map(task => (
              <div key={task.id} style={{ padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
                <Tag color="error" style={{ marginRight: 6, fontSize: 11 }}>阻塞任务</Tag>
                <Text style={{ fontSize: 13 }}>{task.title}</Text>
              </div>
            ))
          ) : (
            <Empty description="当前无风险任务" image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: "24px 0" }}
            />
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {relatedTasks.length} 个关联任务，{relatedTasks.filter(t => t.status === "blocked").length} 个阻塞
          </Text>
        </Space>
      ),
    },
    {
      key: "documents",
      label: <Space size={4}><FolderOpenOutlined />关联单据</Space>,
      children: (
        <Table
          size="small"
          dataSource={relatedDocuments}
          rowKey="id"
          pagination={{ hideOnSinglePage: true, size: "small" }}
          locale={{ emptyText: <Empty description="暂无关联单据" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          columns={[
            { title: "单据编号", dataIndex: "id", render: (v: string) => v.slice(0, 8).toUpperCase() },
            { title: "类型", dataIndex: "documentType" },
            { title: "状态", dataIndex: "status", render: (v: string) => <Tag style={{ fontSize: 11 }}>{v}</Tag> },
          ]}
        />
      ),
    },
    {
      key: "history",
      label: <Space size={4}><FileTextOutlined />操作历史</Space>,
      children: (
        relatedVouchers.length > 0 ? (
          <Timeline
            items={relatedVouchers.map(v => ({
              dot: <CheckCircleOutlined style={{ color: "#16a34a" }} />,
              children: (
                <div>
                  <Text strong style={{ fontSize: 13 }}>凭证 {v.id.slice(-6).toUpperCase()}</Text>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <Tag style={{ fontSize: 11 }}>{v.status}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>{v.createdAt?.slice(0, 10)}</Text>
                  </div>
                </div>
              ),
            }))}
          />
        ) : (
          <Empty description="暂无关联凭证" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )
      ),
    },
  ];

  return (
    <Drawer
      title={
        <div>
          <Title level={5} style={{ margin: 0 }}>{contract.title}</Title>
          <Tag style={{
            background: `${STATUS_COLOR[contract.status]}15`,
            border: `1px solid ${STATUS_COLOR[contract.status]}40`,
            color: STATUS_COLOR[contract.status],
            fontSize: 11, marginTop: 4,
          }}>
            {STATUS_LABELS[contract.status] ?? contract.status}
          </Tag>
        </div>
      }
      open={open}
      onClose={onClose}
      width={500}
      aria-label="合同详情"
    >
      <Tabs
        size="small"
        items={tabs}
        tabBarStyle={{ marginBottom: 16 }}
      />
    </Drawer>
  );
}
