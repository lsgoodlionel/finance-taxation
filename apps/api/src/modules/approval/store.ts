/**
 * 审批流的读写（V13-A4）。
 *
 * 状态转换的判断全在 `engine.ts`（纯函数），这里只负责取数、落库与事务边界。
 * 分开的收益在并发上：`submitForApproval` 与 `act` 都要在事务里「读当前状态 →
 * 算新状态 → 写回」，而算的那一步不碰库，可以单独测遍所有分支。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../db/client.js";
import {
  applyApprovalAction,
  canActOnStep,
  resolveRequiredSteps,
  type ApprovalInstanceState,
  type ApprovalStepDef,
  type ApproverType
} from "./engine.js";

export type ApprovalDocumentType =
  | "request"
  | "advance"
  | "reimbursement"
  | "payment"
  | "contract";

export interface ApprovalFlow {
  id: string;
  companyId: string;
  name: string;
  documentType: ApprovalDocumentType;
  isActive: boolean;
  note: string | null;
  steps: ApprovalStepDef[];
}

export interface ApprovalInstance extends ApprovalInstanceState {
  id: string;
  companyId: string;
  flowId: string;
  documentType: ApprovalDocumentType;
  documentId: string;
  submitterUserId: string;
  amountCents: number;
}

export type ApprovalFailureCode =
  | "FLOW_NOT_FOUND"
  | "FLOW_NO_APPLICABLE_STEP"
  | "INSTANCE_NOT_FOUND"
  | "INSTANCE_ALREADY_PENDING"
  | "NOT_AUTHORIZED"
  | "INVALID_TRANSITION";

export type ApprovalResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: ApprovalFailureCode; message: string } };

interface StepDbRow {
  step_order: number;
  approver_type: ApproverType;
  approver_value: string | null;
  min_amount_cents: string;
}

function mapStep(row: StepDbRow): ApprovalStepDef {
  return {
    stepOrder: row.step_order,
    approverType: row.approver_type,
    // manager 类型不存 approver_value，引擎那边也忽略它。
    approverValue: row.approver_value ?? "",
    minAmountCents: Number(row.min_amount_cents)
  };
}

/** 某类单据当前启用的流程。同类型只可能有一条（排他约束保证）。 */
export async function getActiveFlow(
  companyId: string,
  documentType: ApprovalDocumentType
): Promise<ApprovalFlow | null> {
  const flow = await queryOne<{
    id: string;
    company_id: string;
    name: string;
    document_type: ApprovalDocumentType;
    is_active: boolean;
    note: string | null;
  }>(
    `select id, company_id, name, document_type, is_active, note
       from approval_flows
      where company_id = $1 and document_type = $2 and is_active`,
    [companyId, documentType]
  );
  if (!flow) return null;

  const steps = await query<StepDbRow>(
    `select step_order, approver_type, approver_value, min_amount_cents
       from approval_flow_steps where flow_id = $1 order by step_order`,
    [flow.id]
  );

  return {
    id: flow.id,
    companyId: flow.company_id,
    name: flow.name,
    documentType: flow.document_type,
    isActive: flow.is_active,
    note: flow.note,
    steps: steps.map(mapStep)
  };
}

export async function listFlows(companyId: string): Promise<ApprovalFlow[]> {
  const flows = await query<{
    id: string;
    company_id: string;
    name: string;
    document_type: ApprovalDocumentType;
    is_active: boolean;
    note: string | null;
  }>(
    `select id, company_id, name, document_type, is_active, note
       from approval_flows where company_id = $1 order by document_type, created_at`,
    [companyId]
  );
  if (flows.length === 0) return [];

  const steps = await query<StepDbRow & { flow_id: string }>(
    `select flow_id, step_order, approver_type, approver_value, min_amount_cents
       from approval_flow_steps
      where flow_id = any($1::text[]) order by flow_id, step_order`,
    [flows.map((f) => f.id)]
  );

  return flows.map((flow) => ({
    id: flow.id,
    companyId: flow.company_id,
    name: flow.name,
    documentType: flow.document_type,
    isActive: flow.is_active,
    note: flow.note,
    steps: steps.filter((s) => s.flow_id === flow.id).map(mapStep)
  }));
}

export interface CreateFlowInput {
  companyId: string;
  name: string;
  documentType: ApprovalDocumentType;
  steps: readonly Omit<ApprovalStepDef, "stepOrder">[];
  note?: string | null;
}

/**
 * 建流程。步骤按传入顺序编号（1、2、3……）。
 *
 * 建之前把同类型的旧流程停用：排他约束只允许一条启用流程，不先停用会直接
 * 撞约束。**停用而不是删除**——历史实例还引用着它，删掉之后「这单当年怎么
 * 批的」就答不上来了（`flow_id` 的外键是 restrict，本来也删不掉）。
 */
export async function createFlow(input: CreateFlowInput): Promise<ApprovalResult<ApprovalFlow>> {
  if (input.steps.length === 0) {
    return {
      ok: false,
      failure: { code: "FLOW_NO_APPLICABLE_STEP", message: "流程至少要有一个审批步骤" }
    };
  }

  const flowId = `afl-${randomUUID()}`;
  await withTransaction(async (tx) => {
    await tx.query(
      `update approval_flows set is_active = false, updated_at = now()
        where company_id = $1 and document_type = $2 and is_active`,
      [input.companyId, input.documentType]
    );
    await tx.query(
      `insert into approval_flows (id, company_id, name, document_type, note)
       values ($1, $2, $3, $4, $5)`,
      [flowId, input.companyId, input.name, input.documentType, input.note ?? null]
    );
    for (const [index, step] of input.steps.entries()) {
      await tx.query(
        `insert into approval_flow_steps
           (id, flow_id, step_order, approver_type, approver_value, min_amount_cents)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          `afs-${randomUUID()}`,
          flowId,
          index + 1,
          step.approverType,
          step.approverType === "manager" ? null : step.approverValue,
          step.minAmountCents
        ]
      );
    }
  });

  const created = await getActiveFlow(input.companyId, input.documentType);
  return created
    ? { ok: true, value: created }
    : { ok: false, failure: { code: "FLOW_NOT_FOUND", message: "流程创建后读取失败" } };
}

const INSTANCE_COLUMNS = `
  id, company_id, flow_id, document_type, document_id, submitter_user_id,
  status, current_step_order, required_step_orders, amount_cents
`;

interface InstanceDbRow {
  id: string;
  company_id: string;
  flow_id: string;
  document_type: ApprovalDocumentType;
  document_id: string;
  submitter_user_id: string;
  status: ApprovalInstanceState["status"];
  current_step_order: number | null;
  required_step_orders: number[];
  amount_cents: string;
}

function mapInstance(row: InstanceDbRow): ApprovalInstance {
  return {
    id: row.id,
    companyId: row.company_id,
    flowId: row.flow_id,
    documentType: row.document_type,
    documentId: row.document_id,
    submitterUserId: row.submitter_user_id,
    status: row.status,
    currentStepOrder: row.current_step_order,
    requiredStepOrders: row.required_step_orders,
    amountCents: Number(row.amount_cents)
  };
}

export interface SubmitInput {
  companyId: string;
  documentType: ApprovalDocumentType;
  documentId: string;
  submitterUserId: string;
  amountCents: number;
  /** 抄送人。 */
  watcherUserIds?: readonly string[];
}

/**
 * 提交审批。
 *
 * 步骤序列在这里**按金额算定并存下来**，之后不再重算——单据金额在驳回后
 * 可能被改，重算会让已批过的步骤凭空消失。金额变了就重新提交。
 */
export async function submitForApproval(
  input: SubmitInput
): Promise<ApprovalResult<ApprovalInstance>> {
  const flow = await getActiveFlow(input.companyId, input.documentType);
  if (!flow) {
    return {
      ok: false,
      failure: {
        code: "FLOW_NOT_FOUND",
        message: `没有为「${input.documentType}」配置启用的审批流程`
      }
    };
  }

  const required = resolveRequiredSteps(flow.steps, input.amountCents);
  if (required.length === 0) {
    // 所有步骤都有金额门槛且本单金额太低。这是配置问题（应该有一级门槛为 0），
    // 但**不自动通过**——静默放行会让「审批流形同虚设」这件事没人发现。
    return {
      ok: false,
      failure: {
        code: "FLOW_NO_APPLICABLE_STEP",
        message:
          `流程「${flow.name}」的所有步骤都设了金额门槛，本单金额未触发任何一级。` +
          `请给第一级把门槛设为 0。`
      }
    };
  }

  const orders = required.map((step) => step.stepOrder);
  const id = `api-${randomUUID()}`;

  try {
    await withTransaction(async (tx) => {
      await tx.query(
        `insert into approval_instances
           (id, company_id, flow_id, document_type, document_id, submitter_user_id,
            current_step_order, required_step_orders, amount_cents)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          input.companyId,
          flow.id,
          input.documentType,
          input.documentId,
          input.submitterUserId,
          orders[0],
          orders,
          input.amountCents
        ]
      );
      for (const userId of input.watcherUserIds ?? []) {
        await tx.query(
          `insert into approval_watchers (id, instance_id, user_id) values ($1, $2, $3)
           on conflict (instance_id, user_id) do nothing`,
          [`aw-${randomUUID()}`, id, userId]
        );
      }
    });
  } catch (error) {
    // 排他约束：同一单据已有进行中的审批。不当成 500——用户连点两次提交
    // 是最常见的触发方式，报「已在审批中」比报服务器错误准确得多。
    if (typeof error === "object" && error !== null && "code" in error &&
        (error as { code?: string }).code === "23P01") {
      return {
        ok: false,
        failure: { code: "INSTANCE_ALREADY_PENDING", message: "该单据已在审批中" }
      };
    }
    throw error;
  }

  const created = await queryOne<InstanceDbRow>(
    `select ${INSTANCE_COLUMNS} from approval_instances where id = $1`,
    [id]
  );
  return { ok: true, value: mapInstance(created!) };
}

export interface ActInput {
  companyId: string;
  instanceId: string;
  actor: { userId: string; roleCodes: readonly string[] };
  action: "approve" | "reject" | "cancel";
  comment?: string | null;
}

/**
 * 发起人的直属上级（所在部门的负责人）。
 *
 * **在这里查而不是让路由传进来**：路由层拿不到 `submitterUserId`（它在事务里
 * 才读到），只能传当前用户 id——而 `canActOnStep` 的 manager 分支比对的正是
 * 「传进来的上级 === 操作人」，传当前用户等于恒真，**任何人都能批 manager
 * 步骤**。这个洞在写路由时真的出现过一次。
 *
 * 用部门负责人而不是另建汇报关系表：与 FT 既有的组织模型一致。
 */
async function resolveManagerUserId(
  tx: { query: <T extends object>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  submitterUserId: string
): Promise<string | null> {
  const rows = await tx.query<{ leader_user_id: string | null }>(
    `select d.leader_user_id
       from users u join departments d on d.id = u.department_id
      where u.id = $1`,
    [submitterUserId]
  );
  return rows.rows[0]?.leader_user_id ?? null;
}

/**
 * 执行一个审批动作。
 *
 * 整个「读状态 → 判权 → 算新状态 → 写回」在一个事务里，且读的时候加行锁——
 * 不加锁的话两个审批人同时点批准会双双读到同一个 currentStepOrder，
 * 各自算出「推进到下一步」，第二个覆盖第一个，中间一级被跳过。
 */
export async function act(input: ActInput): Promise<ApprovalResult<ApprovalInstance>> {
  return withTransaction(async (tx) => {
    const found = await tx.query<InstanceDbRow>(
      `select ${INSTANCE_COLUMNS} from approval_instances
        where company_id = $1 and id = $2 for update`,
      [input.companyId, input.instanceId]
    );
    const row = found.rows[0];
    if (!row) {
      return {
        ok: false as const,
        failure: { code: "INSTANCE_NOT_FOUND" as const, message: "审批单不存在" }
      };
    }
    const instance = mapInstance(row);

    // 撤回只有发起人能做；批准/驳回要按步骤定义判权。
    if (input.action === "cancel") {
      if (instance.submitterUserId !== input.actor.userId) {
        return {
          ok: false as const,
          failure: { code: "NOT_AUTHORIZED" as const, message: "只有发起人能撤回" }
        };
      }
    } else {
      const steps = await tx.query<StepDbRow>(
        `select step_order, approver_type, approver_value, min_amount_cents
           from approval_flow_steps where flow_id = $1 and step_order = $2`,
        [instance.flowId, instance.currentStepOrder]
      );
      const step = steps.rows[0] ? mapStep(steps.rows[0]) : null;
      if (!step) {
        return {
          ok: false as const,
          failure: {
            code: "INVALID_TRANSITION" as const,
            message: "当前步骤在流程定义里已不存在，请联系管理员检查流程配置"
          }
        };
      }
      // manager 步骤才去查组织架构——其余两种类型不需要，省一次查询。
      const managerUserId =
        step.approverType === "manager"
          ? await resolveManagerUserId(tx, instance.submitterUserId)
          : null;
      if (!canActOnStep(step, input.actor, managerUserId)) {
        return {
          ok: false as const,
          failure: { code: "NOT_AUTHORIZED" as const, message: "你不是当前步骤的审批人" }
        };
      }
    }

    let next: ApprovalInstanceState;
    try {
      next = applyApprovalAction(
        instance,
        input.action === "cancel"
          ? { action: "cancel" }
          : { action: input.action, stepOrder: instance.currentStepOrder! }
      );
    } catch (error) {
      // 引擎抛的是「已结束」「不是当前步骤」这类业务判断，转成 4xx 而不是 500。
      return {
        ok: false as const,
        failure: {
          code: "INVALID_TRANSITION" as const,
          message: error instanceof Error ? error.message : "审批状态不允许该操作"
        }
      };
    }

    await tx.query(
      `insert into approval_actions (id, instance_id, step_order, actor_user_id, action, comment)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (instance_id, step_order, actor_user_id) do nothing`,
      [
        `aa-${randomUUID()}`,
        instance.id,
        instance.currentStepOrder ?? 0,
        input.actor.userId,
        input.action,
        input.comment ?? null
      ]
    );

    const updated = await tx.query<InstanceDbRow>(
      `update approval_instances
          set status = $3, current_step_order = $4, updated_at = now()
        where company_id = $1 and id = $2
        returning ${INSTANCE_COLUMNS}`,
      [input.companyId, instance.id, next.status, next.currentStepOrder]
    );

    return { ok: true as const, value: mapInstance(updated.rows[0]!) };
  });
}

/**
 * 某人的待办审批。
 *
 * 用 `roleCodes` 与 `userId` 双路匹配当前步骤的审批人。`manager` 类型的步骤
 * 在 SQL 里判不了（要查组织架构），单独用 `directReportUserIds` 传进来——
 * 调用方已经为了别的用途查过下属清单，这里不再查一遍。
 */
export async function listPendingFor(
  companyId: string,
  actor: { userId: string; roleCodes: readonly string[]; directReportUserIds?: readonly string[] }
): Promise<ApprovalInstance[]> {
  const rows = await query<InstanceDbRow>(
    `select i.id, i.company_id, i.flow_id, i.document_type, i.document_id,
            i.submitter_user_id, i.status, i.current_step_order,
            i.required_step_orders, i.amount_cents
       from approval_instances i
       join approval_flow_steps s
         on s.flow_id = i.flow_id and s.step_order = i.current_step_order
      where i.company_id = $1
        and i.status = 'pending'
        and (
          (s.approver_type = 'user' and s.approver_value = $2)
          or (s.approver_type = 'role' and s.approver_value = any($3::text[]))
          or (s.approver_type = 'manager' and i.submitter_user_id = any($4::text[]))
        )
      order by i.created_at`,
    [companyId, actor.userId, actor.roleCodes, actor.directReportUserIds ?? []]
  );
  return rows.map(mapInstance);
}

/** 一个单据的审批历史，供详情页展示「谁在什么时候批的」。 */
export async function listActions(instanceId: string) {
  return query<{
    step_order: number;
    actor_user_id: string;
    action: string;
    comment: string | null;
    acted_at: string;
  }>(
    `select step_order, actor_user_id, action, comment, acted_at
       from approval_actions where instance_id = $1 order by acted_at`,
    [instanceId]
  );
}
