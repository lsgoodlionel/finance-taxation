/**
 * API Key 管理：列表 / 生成（明文一次性展示）/ 撤销。
 */
import { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Button, Space, Tag, Typography, Modal, Input, Form, Popconfirm, Empty,
} from "antd";
import { KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyRecord } from "../../../lib/api";
import { SecretRevealModal } from "./SecretRevealModal";

const { Text } = Typography;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 16).replace("T", " ");
}

export function ApiKeySection() {
  const [items, setItems] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listApiKeys();
      setItems(res.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error("请输入密钥名称");
      return;
    }
    setCreating(true);
    try {
      const res = await createApiKey(newName.trim());
      setNameModalOpen(false);
      setNewName("");
      setRevealKey(res.key);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeApiKey(id);
      toast.success("密钥已撤销");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card
      title={<Space><KeyOutlined style={{ color: "#7c3aed" }} /><Text strong>API Key</Text></Space>}
      style={{ borderRadius: 10 }}
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setNameModalOpen(true)}>
          生成密钥
        </Button>
      }
    >
      <Table<ApiKeyRecord>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={items}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无 API Key" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        columns={[
          { title: "名称", dataIndex: "name", key: "name" },
          {
            title: "前缀", dataIndex: "keyPrefix", key: "keyPrefix",
            render: (v: string) => <code style={{ fontSize: 12 }}>{v}…</code>,
          },
          {
            title: "创建时间", dataIndex: "createdAt", key: "createdAt",
            render: (v: string) => formatDateTime(v),
          },
          {
            title: "状态", key: "status",
            render: (_: unknown, record: ApiKeyRecord) =>
              record.revokedAt
                ? <Tag color="default">已撤销 · {formatDateTime(record.revokedAt)}</Tag>
                : <Tag color="success">生效中</Tag>,
          },
          {
            title: "操作", key: "action",
            render: (_: unknown, record: ApiKeyRecord) =>
              record.revokedAt ? (
                <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
              ) : (
                <Popconfirm
                  title="撤销此密钥？"
                  description="撤销后使用该密钥的调用将立即失效，且不可恢复。"
                  okText="撤销" okType="danger" cancelText="取消"
                  onConfirm={() => void handleRevoke(record.id)}
                >
                  <Button size="small" danger>撤销</Button>
                </Popconfirm>
              ),
          },
        ]}
      />

      <Modal
        open={nameModalOpen}
        title="生成新的 API Key"
        onCancel={() => { setNameModalOpen(false); setNewName(""); }}
        onOk={() => void handleCreate()}
        confirmLoading={creating}
        okText="生成"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="密钥名称" required>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如：财务系统对接、报表拉取脚本"
              onPressEnter={() => void handleCreate()}
              autoFocus
            />
          </Form.Item>
        </Form>
      </Modal>

      <SecretRevealModal
        open={revealKey !== null}
        title="API Key 已生成"
        secret={revealKey ?? ""}
        onClose={() => setRevealKey(null)}
      />
    </Card>
  );
}
