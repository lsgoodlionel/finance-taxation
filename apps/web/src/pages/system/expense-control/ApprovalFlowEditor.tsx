/**
 * 审批流拖拽编辑器（V15）。
 *
 * ## 为什么不是自由连线的节点图
 *
 * 这个审批流在数据模型上是**线性**的——V13 定的：条件路由全部表达在步骤的
 * 金额门槛上，不做分支（`docs/v13-...` 第二节）。引擎按 `required_step_orders`
 * 升序推进，存不下「A 之后分两条路」这种结构。
 *
 * 做成节点图会让界面表达出后端根本存不下的东西：用户连出一个分支，保存时
 * 被悄悄拉直——**那比没有编辑器更糟**，因为他以为自己配好了。
 *
 * 所以拖拽编辑在这里的正确形态是两件事：
 *
 * 1. **拖步骤调顺序**——审批链的先后
 * 2. **拖审批人跨步骤移动**——把「总监」从第 2 步挪到第 3 步
 *
 * 两件都是线性模型里真实存在的操作。
 *
 * ## 门槛递减会提示但不拦
 *
 * 第 1 步门槛 1 万、第 2 步门槛 0，意味着小额单据**跳过第一级**直接走第二级——
 * 通常是配置错误，但也可能是有意的（「大额才要部门经理，小额直接财务」）。
 * 判断不了的时候提示，不替用户决定。
 */

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Alert, Button, Input, InputNumber, Select, Space, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, HolderOutlined, PlusOutlined } from "@ant-design/icons";
import type { ApproverType, StepMode } from "../../../lib/api-expense-control";

export interface DraftApprover {
  key: number;
  approverType: ApproverType;
  approverValue: string;
}

export interface DraftStep {
  key: number;
  mode: StepMode;
  minAmountYuan: number;
  approvers: DraftApprover[];
}

const APPROVER_TYPE_LABELS: Record<ApproverType, string> = {
  role: "按角色",
  user: "指定到人",
  manager: "发起人的直属上级"
};

const MODE_OPTIONS: Array<{ value: StepMode; label: string }> = [
  { value: "all", label: "会签（都要批）" },
  { value: "any", label: "或签（任一批）" }
];

/** 拖拽 id 的编码。前缀区分「拖的是步骤」还是「拖的是审批人」。 */
const stepId = (key: number) => `step:${key}`;
const approverId = (stepKey: number, approverKey: number) => `appr:${stepKey}:${approverKey}`;

function parseId(id: string): { kind: "step" | "approver"; stepKey: number; approverKey?: number } {
  const parts = id.split(":");
  if (parts[0] === "step") return { kind: "step", stepKey: Number(parts[1]) };
  return { kind: "approver", stepKey: Number(parts[1]), approverKey: Number(parts[2]) };
}

export interface ApprovalFlowEditorProps {
  steps: DraftStep[];
  onChange: (steps: DraftStep[]) => void;
}

export function ApprovalFlowEditor({ steps, onChange }: ApprovalFlowEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // 5px 才算拖动：低于这个数，点一下选择框都会被当成拖拽。
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 键盘也能拖。审批流配置是管理员做的事，而管理员里有不用鼠标的人。
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /**
   * 门槛递减的提示。
   *
   * 后端不拦这个——它在语义上是合法的。但绝大多数情况下是配置错误：
   * 用户想的是「1 万以上加一级」，写成了「1 万以上才走第一级」。
   */
  const thresholdWarnings = useMemo(() => {
    const warnings: string[] = [];
    for (let i = 1; i < steps.length; i += 1) {
      if (steps[i]!.minAmountYuan < steps[i - 1]!.minAmountYuan) {
        warnings.push(
          `第 ${i + 1} 步的门槛（${steps[i]!.minAmountYuan} 元）低于第 ${i} 步` +
            `（${steps[i - 1]!.minAmountYuan} 元）——小额单据会跳过第 ${i} 步直接走第 ${i + 1} 步`
        );
      }
    }
    return warnings;
  }, [steps]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = parseId(String(active.id));
    const to = parseId(String(over.id));

    if (from.kind === "step") {
      // 拖步骤：只在步骤之间换位。拖到审批人上时取它所属的步骤。
      const fromIndex = steps.findIndex((step) => step.key === from.stepKey);
      const toIndex = steps.findIndex((step) => step.key === to.stepKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      onChange(arrayMove(steps, fromIndex, toIndex));
      return;
    }

    // 拖审批人：可能是同一步内换位，也可能是跨步骤移动。
    const sourceStep = steps.find((step) => step.key === from.stepKey);
    const approver = sourceStep?.approvers.find((item) => item.key === from.approverKey);
    if (!sourceStep || !approver) return;

    if (from.stepKey === to.stepKey && to.kind === "approver") {
      const fromIndex = sourceStep.approvers.findIndex((item) => item.key === from.approverKey);
      const toIndex = sourceStep.approvers.findIndex((item) => item.key === to.approverKey);
      if (fromIndex < 0 || toIndex < 0) return;
      onChange(
        steps.map((step) =>
          step.key === from.stepKey
            ? { ...step, approvers: arrayMove(step.approvers, fromIndex, toIndex) }
            : step
        )
      );
      return;
    }

    if (from.stepKey === to.stepKey) return;

    // 跨步骤移动。**最后一个审批人不许拖走**——空步骤会让单据永久卡死，
    // 而拖动的人未必意识到自己搬空了一步。
    if (sourceStep.approvers.length === 1) return;

    onChange(
      steps.map((step) => {
        if (step.key === from.stepKey) {
          return {
            ...step,
            approvers: step.approvers.filter((item) => item.key !== from.approverKey)
          };
        }
        if (step.key === to.stepKey) {
          // 新 key 在目标步骤内重新分配，避免与目标里已有的撞号。
          const nextKey = Math.max(0, ...step.approvers.map((item) => item.key)) + 1;
          return { ...step, approvers: [...step.approvers, { ...approver, key: nextKey }] };
        }
        return step;
      })
    );
  };

  const activeLabel = useMemo(() => {
    if (activeId === null) return null;
    const parsed = parseId(activeId);
    const step = steps.find((item) => item.key === parsed.stepKey);
    if (!step) return null;
    if (parsed.kind === "step") {
      const index = steps.indexOf(step);
      return `第 ${index + 1} 步`;
    }
    const approver = step.approvers.find((item) => item.key === parsed.approverKey);
    return approver ? describeApprover(approver) : null;
  }, [activeId, steps]);

  const updateStep = (key: number, patch: Partial<DraftStep>) => {
    onChange(steps.map((step) => (step.key === key ? { ...step, ...patch } : step)));
  };

  const updateApprover = (stepKey: number, approverKey: number, patch: Partial<DraftApprover>) => {
    onChange(
      steps.map((step) =>
        step.key === stepKey
          ? {
              ...step,
              approvers: step.approvers.map((item) =>
                item.key === approverKey ? { ...item, ...patch } : item
              )
            }
          : step
      )
    );
  };

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        拖<HolderOutlined /> 调整顺序：拖步骤换先后，拖审批人可以挪到别的步骤。
        门槛是「达到即触发」——写 10000 表示 1 万整也要走这一级。
      </Typography.Paragraph>

      {thresholdWarnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="门槛顺序可能不是你想要的"
          description={
            <>
              {thresholdWarnings.map((text) => (
                <div key={text}>· {text}</div>
              ))}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                这在语义上是合法的（可能你就想「大额才要部门经理」），所以不拦你。
              </Typography.Text>
            </>
          }
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={steps.map((step) => stepId(step.key))}
          strategy={verticalListSortingStrategy}
        >
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {steps.map((step, index) => (
              <SortableStep
                key={step.key}
                step={step}
                index={index}
                canRemove={steps.length > 1}
                onUpdate={(patch) => updateStep(step.key, patch)}
                onUpdateApprover={(approverKey, patch) =>
                  updateApprover(step.key, approverKey, patch)
                }
                onAddApprover={() =>
                  updateStep(step.key, {
                    approvers: [
                      ...step.approvers,
                      {
                        key: Math.max(0, ...step.approvers.map((item) => item.key)) + 1,
                        approverType: "role",
                        approverValue: ""
                      }
                    ]
                  })
                }
                onRemoveApprover={(approverKey) =>
                  updateStep(step.key, {
                    approvers: step.approvers.filter((item) => item.key !== approverKey)
                  })
                }
                onRemove={() => onChange(steps.filter((item) => item.key !== step.key))}
              />
            ))}
          </Space>
        </SortableContext>

        {/* 拖动时跟手的浮层。没有它，被拖的元素留在原位，看不出正在拖什么。 */}
        <DragOverlay>
          {activeLabel !== null ? (
            <Tag color="blue" style={{ padding: "4px 10px", fontSize: 13 }}>
              {activeLabel}
            </Tag>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Button
        size="small"
        icon={<PlusOutlined />}
        style={{ marginTop: 8 }}
        onClick={() =>
          onChange([
            ...steps,
            {
              key: Math.max(0, ...steps.map((step) => step.key)) + 1,
              mode: "all",
              minAmountYuan: 0,
              approvers: [{ key: 1, approverType: "role", approverValue: "" }]
            }
          ])
        }
      >
        加一级
      </Button>
    </div>
  );
}

function describeApprover(approver: DraftApprover): string {
  if (approver.approverType === "manager") return "直属上级";
  return `${APPROVER_TYPE_LABELS[approver.approverType]} ${approver.approverValue || "（未指定）"}`;
}

interface SortableStepProps {
  step: DraftStep;
  index: number;
  canRemove: boolean;
  onUpdate: (patch: Partial<DraftStep>) => void;
  onUpdateApprover: (approverKey: number, patch: Partial<DraftApprover>) => void;
  onAddApprover: () => void;
  onRemoveApprover: (approverKey: number) => void;
  onRemove: () => void;
}

function SortableStep({
  step,
  index,
  canRemove,
  onUpdate,
  onUpdateApprover,
  onAddApprover,
  onRemoveApprover,
  onRemove
}: SortableStepProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stepId(step.key)
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        border: "1px solid #f0f0f0",
        borderRadius: 8,
        padding: 12,
        background: "#fff"
      }}
    >
      <Space align="center" wrap style={{ marginBottom: 8 }}>
        {/* 抓手单独一个元素——整块可拖会让里面的输入框选不中文字 */}
        <Tooltip title="拖动调整步骤顺序">
          <span
            {...attributes}
            {...listeners}
            style={{ cursor: "grab", color: "#8c8c8c", padding: "0 4px" }}
            aria-label={`拖动第 ${index + 1} 步`}
          >
            <HolderOutlined />
          </span>
        </Tooltip>
        <Tag>第 {index + 1} 步</Tag>

        <InputNumber
          size="small"
          style={{ width: 160 }}
          min={0}
          precision={2}
          addonBefore="≥"
          addonAfter="元"
          value={step.minAmountYuan}
          onChange={(value) => onUpdate({ minAmountYuan: value ?? 0 })}
        />

        {/* 只有一个审批人时会签与或签行为相同，选它没有意义 */}
        {step.approvers.length > 1 && (
          <Select
            size="small"
            style={{ width: 160 }}
            value={step.mode}
            onChange={(value: StepMode) => onUpdate({ mode: value })}
            options={MODE_OPTIONS}
          />
        )}

        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined />}
          disabled={!canRemove}
          onClick={onRemove}
        />
      </Space>

      <SortableContext
        items={step.approvers.map((approver) => approverId(step.key, approver.key))}
        strategy={verticalListSortingStrategy}
      >
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          {step.approvers.map((approver) => (
            <SortableApprover
              key={approver.key}
              stepKey={step.key}
              approver={approver}
              canRemove={step.approvers.length > 1}
              onUpdate={(patch) => onUpdateApprover(approver.key, patch)}
              onRemove={() => onRemoveApprover(approver.key)}
            />
          ))}
        </Space>
      </SortableContext>

      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onAddApprover} style={{ marginTop: 6 }}>
        这一步再加一个人
      </Button>
    </div>
  );
}

interface SortableApproverProps {
  stepKey: number;
  approver: DraftApprover;
  canRemove: boolean;
  onUpdate: (patch: Partial<DraftApprover>) => void;
  onRemove: () => void;
}

function SortableApprover({
  stepKey,
  approver,
  canRemove,
  onUpdate,
  onRemove
}: SortableApproverProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: approverId(stepKey, approver.key)
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        display: "flex",
        alignItems: "center",
        gap: 6
      }}
    >
      <Tooltip title={canRemove ? "拖到别的步骤可以移动他" : "这一步只剩一个人，拖走会让单据卡死"}>
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: canRemove ? "grab" : "not-allowed", color: "#bfbfbf" }}
          aria-label="拖动审批人"
        >
          <HolderOutlined />
        </span>
      </Tooltip>

      <Select
        size="small"
        style={{ width: 170 }}
        value={approver.approverType}
        onChange={(value: ApproverType) => onUpdate({ approverType: value })}
        options={Object.entries(APPROVER_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
      />

      {approver.approverType !== "manager" && (
        <Input
          size="small"
          style={{ width: 200 }}
          placeholder={approver.approverType === "role" ? "角色码" : "用户 id"}
          value={approver.approverValue}
          onChange={(e) => onUpdate({ approverValue: e.target.value })}
        />
      )}

      <Button
        size="small"
        type="text"
        danger
        icon={<DeleteOutlined />}
        disabled={!canRemove}
        onClick={onRemove}
      />
    </div>
  );
}
