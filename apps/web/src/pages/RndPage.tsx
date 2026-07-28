/**
 * 研发辅助账（V10 车道：按任务重组）。
 *
 * 改造前首屏 8 个平级区块：页头卡、全站 10 环节导航条、4 张 KPI 卡、空态提示、
 * 项目列表卡、项目详情卡（内含 8 行属性 + 政策风险 + 政策建议三段）、归集向导
 * Modal、新建项目 Modal。KPI 卡的四个数与详情卡里的数是同一批，列表与详情左右
 * 各占半屏，而真正要动手的「归集费用」缩在表格行内的一个小按钮里——用户打开
 * 看到的是「研发辅助账能看什么」，不是「你现在要办什么」。
 *
 * 改造后归口成三件事（挑项目 → 归集费用 → 核对加计扣除），TaskFocusShell 一次
 * 只渲染一件事，选中的项目和当前这件事都写进 URL。全站导航条移除，理由与
 * /ledger、/tax 一致：它按当前页在数组里的下标算 done/current，与业务数据无关，
 * 本质是导航；何况这里还被写成了 current="ledger"——研发页并不是总账页。
 * 「这一笔走到哪了」改由 ObjectFlowBar 按项目的真实字段渲染（见 rnd/rnd-tasks.ts）。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { RndProject, RndProjectSummary, SuperDeductionPackage } from "@finance-taxation/domain-model";
import { Button, Input, Modal, Skeleton, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import {
  createRndProject,
  getRndProjectDetail,
  getRndSuperDeductionPackage,
  listRndProjects,
  type RndProjectDetail
} from "../lib/api";
import { PageHeader } from "../components/ui/PageHeader";
import { TaskFocusShell } from "../components/ui/TaskFocusShell";
import { RndContextPanel } from "./rnd/RndContextPanel";
import { RndCostPanel } from "./rnd/RndCostPanel";
import { RndCostWizard } from "./rnd/RndCostWizard";
import { RndDeductionPanel } from "./rnd/RndDeductionPanel";
import { RndProjectListPanel } from "./rnd/RndProjectListPanel";
import { RndShell } from "./rnd/RndShell";
import {
  RND_TASK_KEYS,
  buildRndTasks,
  countProjectsWithoutCosts,
  isRndTaskKey,
  readRndProjectId,
  readRndTask,
  writeRndProjectId,
  writeRndTask
} from "./rnd/rnd-tasks";

const { Text } = Typography;

const DEFAULT_PROJECT_NAME = "AI 财税系统研发";

type RndProjectRow = RndProject & { summary: RndProjectSummary };

export function RndPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<RndProjectRow[]>([]);
  const [detail, setDetail] = useState<RndProjectDetail | null>(null);
  const [deductionPackage, setDeductionPackage] = useState<SuperDeductionPackage | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState(DEFAULT_PROJECT_NAME);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("正在加载研发项目。");

  const activeTask = readRndTask(searchParams);
  const urlProjectId = readRndProjectId(searchParams);

  /**
   * 实际选中的项目：URL 上的 id 必须真的在清单里才作数，否则回落到第一个。
   * 直接信 URL 会让一个失效的分享链接把页面卡在空详情上。
   */
  const selectedProjectId = useMemo(() => {
    if (urlProjectId && projects.some((project) => project.id === urlProjectId)) {
      return urlProjectId;
    }
    return projects[0]?.id ?? null;
  }, [projects, urlProjectId]);

  const tasks = useMemo(() => buildRndTasks(projects), [projects]);
  const projectsWithoutCosts = countProjectsWithoutCosts(projects);

  function selectTask(task: string): void {
    if (!isRndTaskKey(task)) return;
    setSearchParams(writeRndTask(searchParams, task));
  }

  function selectProject(projectId: string): void {
    setSearchParams(writeRndProjectId(searchParams, projectId));
  }

  /**
   * 从列表直接开工：选中项目 + 切到「归集费用」。
   *
   * 刻意不在这里顺手把向导也打开：detail 是异步换的，此刻 state 里还是上一个项目的
   * 详情，向导会带着错的项目名和错的政策提示弹出来，用户填完提交到另一个项目上。
   * 落到「归集费用」工作区后由用户点「继续归集费用」，那时 detail 已经是对的。
   */
  function collectCostsFor(projectId: string): void {
    setSearchParams(writeRndTask(writeRndProjectId(searchParams, projectId), RND_TASK_KEYS.costs));
  }

  async function loadProjects(): Promise<void> {
    setLoading(true);
    try {
      const payload = await listRndProjects();
      setProjects(payload.items);
      setMessage(`共 ${payload.total} 个研发项目。`);
    } catch (error) {
      const text = (error as Error).message;
      setMessage(text);
      toast.error(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  /**
   * 详情与资料包都跟着选中的项目走。
   * 资料包单独记错误：清单取不到不该把整块详情也清空，用户还得靠详情继续归集。
   */
  useEffect(() => {
    if (!selectedProjectId) {
      setDetail(null);
      setDeductionPackage(null);
      return;
    }

    let cancelled = false;

    // 换项目时把向导关掉：它是对着某一个项目填的，留在屏幕上会变成
    // 「标题是新项目、正在填的条目属于旧项目」。
    setWizardOpen(false);

    void getRndProjectDetail(selectedProjectId)
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const text = (error as Error).message;
        setDetail(null);
        setMessage(text);
        toast.error(text);
      });

    setDeductionPackage(null);
    setPackageError(null);
    void getRndSuperDeductionPackage(selectedProjectId)
      .then((payload) => {
        if (!cancelled) setDeductionPackage(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) setPackageError((error as Error).message);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    setCreating(true);
    try {
      const project = await createRndProject({ name: newName, capitalizationPolicy: "mixed" });
      await loadProjects();
      // 新建完直接选中它，否则用户还得自己在列表里找一遍刚建的项目。
      setSearchParams(writeRndProjectId(searchParams, project.id));
      setCreateOpen(false);
      setNewName(DEFAULT_PROJECT_NAME);
      toast.success(`研发项目「${project.name}」已建立`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function refreshAfterCollection(): Promise<void> {
    await loadProjects();
    if (!selectedProjectId) return;
    try {
      const [nextDetail, nextPackage] = await Promise.all([
        getRndProjectDetail(selectedProjectId),
        getRndSuperDeductionPackage(selectedProjectId)
      ]);
      setDetail(nextDetail);
      setDeductionPackage(nextPackage);
      setPackageError(null);
    } catch (error) {
      setPackageError((error as Error).message);
    }
  }

  function renderWorkspace() {
    switch (activeTask) {
      case RND_TASK_KEYS.projects:
        return (
          <RndProjectListPanel
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={selectProject}
            onCollectCosts={collectCostsFor}
          />
        );
      case RND_TASK_KEYS.costs:
        return <RndCostPanel project={detail} onOpenWizard={() => setWizardOpen(true)} />;
      case RND_TASK_KEYS.deduction:
        return (
          <RndDeductionPanel
            project={detail}
            deductionPackage={deductionPackage}
            packageError={packageError}
          />
        );
    }
  }

  return (
    <>
      <RndShell
        header={(
          <PageHeader
            title="研发辅助账"
            subtitle="按项目归集研发费用、算出加计扣除基数，供年度汇算清缴引用"
            actions={(
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建研发项目
              </Button>
            )}
          />
        )}
      >
        <TaskFocusShell
          tasks={tasks}
          activeKey={activeTask}
          onSelectTask={selectTask}
          switcherLabel="研发辅助账能办的事"
          aside={(
            <RndContextPanel
              task={activeTask}
              project={detail}
              projectCount={projects.length}
              projectsWithoutCosts={projectsWithoutCosts}
              message={message}
            />
          )}
        >
          {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : renderWorkspace()}
        </TaskFocusShell>
      </RndShell>

      <RndCostWizard
        open={wizardOpen}
        project={detail}
        onClose={() => setWizardOpen(false)}
        onComplete={() => void refreshAfterCollection()}
      />

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
            onChange={(event) => setNewName(event.target.value)}
            placeholder="如：AI 财税系统研发 2026"
            style={{ marginTop: 8 }}
            onPressEnter={() => void handleCreate()}
          />
        </div>
      </Modal>
    </>
  );
}
