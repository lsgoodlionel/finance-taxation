import { useEffect, useState } from "react";
import type { RndProject, RndProjectSummary } from "@finance-taxation/domain-model";
import {
  createRndProject, getRndProjectDetail, listRndProjects,
  type RndProjectDetail,
} from "../lib/api";
import { RND_STATUS_LABELS, useI18n } from "../lib/i18n";
import {
  Typography, Row, Col, Card, Table, Tag, Button, Space, Skeleton,
  Alert, Input, Modal, Descriptions,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ExperimentOutlined, RightOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { RndKpiCards } from "./rnd/RndKpiCards";
import { RndCostWizard } from "./rnd/RndCostWizard";

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  planning:  "default",
  active:    "processing",
  completed: "success",
  archived:  "default",
};

export function RndPage() {
  const { t } = useI18n();
  const [projects, setProjects]         = useState<Array<RndProject & { summary: RndProjectSummary }>>([]);
  const [selectedProject, setSelected] = useState<RndProjectDetail | null>(null);
  const [loading, setLoading]           = useState(true);
  const [wizardOpen, setWizardOpen]     = useState(false);
  const [createOpen, setCreateOpen]     = useState(false);
  const [newName, setNewName]           = useState("AI 财税系统研发");
  const [creating, setCreating]         = useState(false);

  useEffect(() => { void refresh(); }, []);

  async function refresh(targetId?: string) {
    setLoading(true);
    try {
      const payload = await listRndProjects();
      setProjects(payload.items);
      const id = targetId ?? payload.items[0]?.id;
      if (id) {
        const detail = await getRndProjectDetail(id);
        setSelected(detail);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) { toast.error("请输入项目名称"); return; }
    setCreating(true);
    try {
      const project = await createRndProject({ name: newName, capitalizationPolicy: "mixed" });
      await refresh(project.id);
      setCreateOpen(false);
      setNewName("AI 财税系统研发");
      toast.success(`研发项目「${project.name}」已建立`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const columns: ColumnsType<RndProject & { summary: RndProjectSummary }> = [
    {
      title: "项目名称", dataIndex: "name", key: "name",
      render: (name: string, record) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{name}</Text>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{record.code}</div>
        </div>
      ),
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 90,
      render: (s: string) => <Tag color={STATUS_COLOR[s] ?? "default"}>{t(RND_STATUS_LABELS, s)}</Tag>,
    },
    {
      title: "费用化", key: "expensed", width: 110, align: "right",
      render: (_: unknown, r) => <Text style={{ fontFamily: "monospace", fontSize: 12 }}>¥{parseFloat(r.summary.expenseAmount || "0").toLocaleString()}</Text>,
    },
    {
      title: "可扣除基数", key: "eligible", width: 120, align: "right",
      render: (_: unknown, r) => (
        <Text strong style={{ fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>
          ¥{parseFloat(r.summary.superDeductionEligibleBase || "0").toLocaleString()}
        </Text>
      ),
    },
    {
      title: "操作", key: "actions", width: 130,
      render: (_: unknown, record) => (
        <Space size={4}>
          <Button size="small" type="link"
            onClick={() => void getRndProjectDetail(record.id).then(setSelected)}>
            详情 <RightOutlined />
          </Button>
          <Button size="small" icon={<ExperimentOutlined />}
            onClick={() => {
              void getRndProjectDetail(record.id).then(detail => {
                setSelected(detail);
                setWizardOpen(true);
              });
            }}>
            归集
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0, color: "#0f172a" }}>研发辅助账</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            归集研发费用、计算加计扣除基数，满足高新技术企业税务合规要求
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建研发项目
        </Button>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          {/* KPI cards */}
          <RndKpiCards projects={projects} />

          {projects.length === 0 && (
            <Alert
              type="info" showIcon
              message="暂无研发项目，点击「新建研发项目」开始费用归集"
            />
          )}

          {/* Project list + detail */}
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card
                title={<Space><Text strong>研发项目列表</Text><Tag>{projects.length}</Tag></Space>}
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: 0 } }}
              >
                <Table
                  dataSource={projects}
                  columns={columns}
                  rowKey="id"
                  size="small"
                  pagination={{ hideOnSinglePage: true, size: "small" }}
                  rowClassName={record => record.id === selectedProject?.id ? "ant-table-row-selected" : ""}
                  onRow={record => ({
                    style: { cursor: "pointer" },
                    onClick: () => void getRndProjectDetail(record.id).then(setSelected),
                  })}
                />
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card
                title={<Text strong>项目详情</Text>}
                style={{ borderRadius: 12 }}
                extra={
                  selectedProject && (
                    <Button
                      type="primary" size="small" icon={<ExperimentOutlined />}
                      onClick={() => setWizardOpen(true)}
                    >
                      费用归集向导
                    </Button>
                  )
                }
              >
                {selectedProject ? (
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="项目名称">{selectedProject.name}</Descriptions.Item>
                      <Descriptions.Item label="项目编号">{selectedProject.code}</Descriptions.Item>
                      <Descriptions.Item label="开始日期">{selectedProject.startedOn}</Descriptions.Item>
                      <Descriptions.Item label="资本化政策">{selectedProject.capitalizationPolicy}</Descriptions.Item>
                      <Descriptions.Item label="费用化合计">
                        ¥{parseFloat(selectedProject.summary.expenseAmount || "0").toLocaleString()}
                      </Descriptions.Item>
                      <Descriptions.Item label="资本化合计">
                        ¥{parseFloat(selectedProject.summary.capitalizedAmount || "0").toLocaleString()}
                      </Descriptions.Item>
                      <Descriptions.Item label="加计扣除基数">
                        <Text strong style={{ color: "#16a34a" }}>
                          ¥{parseFloat(selectedProject.summary.superDeductionEligibleBase || "0").toLocaleString()}
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="累计工时">
                        {selectedProject.summary.totalHours} 小时
                      </Descriptions.Item>
                    </Descriptions>

                    {selectedProject.policyReview.conflicts.length > 0 && (
                      <Alert type="warning" showIcon message="政策合规风险"
                        description={selectedProject.policyReview.conflicts.join("；")}
                      />
                    )}

                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>政策建议</Text>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
                        {selectedProject.policyReview.guidance.map(g => <li key={g}>{g}</li>)}
                      </ul>
                    </div>
                  </Space>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                    <ExperimentOutlined style={{ fontSize: 28, marginBottom: 8 }} />
                    <div>选择项目查看详情</div>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* Cost collection wizard */}
      <RndCostWizard
        open={wizardOpen}
        project={selectedProject}
        onClose={() => setWizardOpen(false)}
        onComplete={() => void refresh(selectedProject?.id)}
      />

      {/* Create project modal */}
      <Modal
        title="新建研发项目"
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ paddingTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>项目名称</Text>
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="如：AI 财税系统研发 2026"
            style={{ marginTop: 8 }}
            onPressEnter={() => void handleCreate()}
          />
        </div>
      </Modal>
    </div>
  );
}
