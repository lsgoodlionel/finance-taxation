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
  isStepSatisfied,
  resolveRequiredSteps,
  type ApprovalInstanceState,
  type ApprovalStepDef,
  type ApproverType,
  type ParticipantStatus,
  type StepMode
} from "./engine.js";

export type ApprovalDocumentType =
  | "request"
  | "advance"
  | "reimbursement"
  | "payment"
  | "contract";

/**
 * 流程里的一个步骤（V14-B）。
 *
 * V13 时「一个步骤 = 一个审批人」，会签需要「一个步骤 = 一组审批人」。
 * 审批人挪进 `approvers`，`ApprovalStepDef` 保持原样表示**一个审批人槽位**——
 * 引擎里的 `canActOnStep` 因此一行没改。
 */
export interface ApprovalFlowStep {
  stepOrder: number;
  minAmountCents: number;
  mode: StepMode;
  approvers: ApprovalStepDef[];
}

export interface ApprovalFlow {
  id: string;
  companyId: string;
  name: string;
  documentType: ApprovalDocumentType;
  isActive: boolean;
  note: string | null;
  steps: ApprovalFlowStep[];
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
  | "FLOW_STEP_HAS_NO_APPROVER"
  | "INSTANCE_NOT_FOUND"
  | "INSTANCE_ALREADY_PENDING"
  | "NOT_AUTHORIZED"
  | "INVALID_TRANSITION"
  | "PARTICIPANT_ALREADY_ACTED";

export type ApprovalResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: ApprovalFailureCode; message: string } };

interface StepDbRow {
  flow_id: string;
  step_order: number;
  min_amount_cents: string;
  mode: StepMode;
}

interface ApproverDbRow {
  flow_id: string;
  step_order: number;
  approver_type: ApproverType;
  approver_value: string | null;
  min_amount_cents: string;
}

function mapApprover(row: ApproverDbRow): ApprovalStepDef {
  return {
    stepOrder: row.step_order,
    approverType: row.approver_type,
    // manager 类型不存 approver_value，引擎那边也忽略它。
    approverValue: row.approver_value ?? "",
    minAmountCents: Number(row.min_amount_cents)
  };
}

const STEP_SELECT = `
  select s.flow_id, s.step_order, s.min_amount_cents, s.mode
    from approval_flow_steps s`;

const APPROVER_SELECT = `
  select a.flow_id, a.step_order, a.approver_type, a.approver_value, s.min_amount_cents
    from approval_flow_step_approvers a
    join approval_flow_steps s on s.flow_id = a.flow_id and s.step_order = a.step_order`;

/** 把步骤行与审批人行拼成一个流程的步骤列表。 */
function assembleSteps(
  flowId: string,
  stepRows: readonly StepDbRow[],
  approverRows: readonly ApproverDbRow[]
): ApprovalFlowStep[] {
  return stepRows
    .filter((row) => row.flow_id === flowId)
    .map((row) => ({
      stepOrder: row.step_order,
      minAmountCents: Number(row.min_amount_cents),
      mode: row.mode,
      approvers: approverRows
        .filter((a) => a.flow_id === flowId && a.step_order === row.step_order)
        .map(mapApprover)
    }));
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

  const [stepRows, approverRows] = await Promise.all([
    query<StepDbRow>(`${STEP_SELECT} where s.flow_id = $1 order by s.step_order`, [flow.id]),
    query<ApproverDbRow>(
      `${APPROVER_SELECT} where a.flow_id = $1 order by a.step_order, a.sort_order`,
      [flow.id]
    )
  ]);

  return {
    id: flow.id,
    companyId: flow.company_id,
    name: flow.name,
    documentType: flow.document_type,
    isActive: flow.is_active,
    note: flow.note,
    steps: assembleSteps(flow.id, stepRows, approverRows)
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

  const flowIds = flows.map((f) => f.id);
  const [stepRows, approverRows] = await Promise.all([
    query<StepDbRow>(
      `${STEP_SELECT} where s.flow_id = any($1::text[]) order by s.flow_id, s.step_order`,
      [flowIds]
    ),
    query<ApproverDbRow>(
      `${APPROVER_SELECT} where a.flow_id = any($1::text[])
        order by a.flow_id, a.step_order, a.sort_order`,
      [flowIds]
    )
  ]);

  return flows.map((flow) => ({
    id: flow.id,
    companyId: flow.company_id,
    name: flow.name,
    documentType: flow.document_type,
    isActive: flow.is_active,
    note: flow.note,
    steps: assembleSteps(flow.id, stepRows, approverRows)
  }));
}

/** 建流程时的一个步骤。审批人是一组，`mode` 决定都要批还是任一批。 */
export interface CreateStepInput {
  mode: StepMode;
  minAmountCents: number;
  approvers: readonly { approverType: ApproverType; approverValue: string }[];
}

export interface CreateFlowInput {
  companyId: string;
  name: string;
  documentType: ApprovalDocumentType;
  steps: readonly CreateStepInput[];
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

  // 一个没有审批人的步骤会让单据永久卡死——没人能批，也没有任何提示。
  // 建的时候拦住，比等到有人提交单据时才发现便宜得多。
  const emptyStep = input.steps.findIndex((step) => step.approvers.length === 0);
  if (emptyStep >= 0) {
    return {
      ok: false,
      failure: {
        code: "FLOW_STEP_HAS_NO_APPROVER",
        message: `第 ${emptyStep + 1} 步没有指定审批人`
      }
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
      const stepOrder = index + 1;
      await tx.query(
        `insert into approval_flow_steps (id, flow_id, step_order, min_amount_cents, mode)
         values ($1, $2, $3, $4, $5)`,
        [`afs-${randomUUID()}`, flowId, stepOrder, step.minAmountCents, step.mode]
      );
      for (const [order, approver] of step.approvers.entries()) {
        await tx.query(
          `insert into approval_flow_step_approvers
             (id, flow_id, step_order, approver_type, approver_value, sort_order)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            `fsa-${randomUUID()}`,
            flowId,
            stepOrder,
            approver.approverType,
            approver.approverType === "manager" ? null : approver.approverValue,
            order + 1
          ]
        );
      }
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

  // V14-B：把每个必经步骤的审批人解析成具体的人。
  //
  // **在提交时解析而不是每次现查**：会签要判断的是「这几个人都批了吗」，
  // 现查角色成员会让中途的入职离职改变结论——一张审批中的单子不该因为
  // 人事变动而忽然算通过或忽然算不通过。与 required_step_orders 固定下来
  // 是同一个道理。
  const submitterManagerId = await resolveManagerUserIdByQuery(input.submitterUserId);
  const participants = await resolveParticipants(input.companyId, required, submitterManagerId);

  const stepWithNobody = required.find(
    (step) => (participants.get(step.stepOrder) ?? []).length === 0
  );
  if (stepWithNobody) {
    // 角色没人、或 manager 步骤但发起人所在部门没设负责人。
    //
    // **不静默跳过这一级**：跳过等于让这一级审批凭空消失，而消失是看不见的。
    // 报出来让人去补配置。
    return {
      ok: false,
      failure: {
        code: "FLOW_STEP_HAS_NO_APPROVER",
        message:
          `流程「${flow.name}」第 ${stepWithNobody.stepOrder} 步没有可用的审批人` +
          `（角色下没有成员，或发起人所在部门未设负责人）`
      }
    };
  }

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
      for (const [stepOrder, userIds] of participants) {
        for (const userId of userIds) {
          await tx.query(
            `insert into approval_step_participants (id, instance_id, step_order, user_id)
             values ($1, $2, $3, $4)
             on conflict (instance_id, step_order, user_id) do nothing`,
            [`asp-${randomUUID()}`, id, stepOrder, userId]
          );
        }
      }
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
 * 把步骤上的审批人定义解析成具体的用户 id。
 *
 * - `user` → 就是那个人
 * - `role` → 该角色当前的所有持有人（会签下都要批，或签下任一人批即可）
 * - `manager` → 发起人所在部门的负责人
 *
 * 返回 Map 而不是扁平数组：调用方要按步骤分别落库，扁平数组还得再分一次组。
 */
async function resolveParticipants(
  companyId: string,
  steps: readonly ApprovalFlowStep[],
  managerUserId: string | null
): Promise<Map<number, string[]>> {
  const roleCodes = steps.flatMap((step) =>
    step.approvers.filter((a) => a.approverType === "role").map((a) => a.approverValue)
  );

  const roleMembers = new Map<string, string[]>();
  if (roleCodes.length > 0) {
    const rows = await query<{ role_id: string; user_id: string }>(
      `select ur.role_id, ur.user_id
         from user_roles ur
         join users u on u.id = ur.user_id
        where u.company_id = $1 and ur.role_id = any($2::text[])`,
      [companyId, roleCodes]
    );
    for (const row of rows) {
      roleMembers.set(row.role_id, [...(roleMembers.get(row.role_id) ?? []), row.user_id]);
    }
  }

  return new Map(
    steps.map((step) => {
      const userIds = step.approvers.flatMap((approver) => {
        if (approver.approverType === "user") return [approver.approverValue];
        if (approver.approverType === "role") return roleMembers.get(approver.approverValue) ?? [];
        return managerUserId === null ? [] : [managerUserId];
      });
      // 去重：一个人既是财务角色成员又被点名列上，只该批一次。
      // 不去重会让会签在他批过之后仍剩一条 pending，单据卡死。
      return [step.stepOrder, [...new Set(userIds)]] as const;
    })
  );
}

/** `resolveManagerUserId` 的非事务版本，供提交时使用。 */
async function resolveManagerUserIdByQuery(submitterUserId: string): Promise<string | null> {
  const row = await queryOne<{ leader_user_id: string | null }>(
    `select d.leader_user_id
       from users u join departments d on d.id = u.department_id
      where u.id = $1`,
    [submitterUserId]
  );
  return row?.leader_user_id ?? null;
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

    // 会签需要这两个值在判权之后、算状态之前都可见。
    let stepMode: StepMode = "all";
    let currentParticipants: readonly { user_id: string; status: ParticipantStatus }[] = [];

    // 撤回只有发起人能做；批准/驳回要按参与人表判权。
    if (input.action === "cancel") {
      if (instance.submitterUserId !== input.actor.userId) {
        return {
          ok: false as const,
          failure: { code: "NOT_AUTHORIZED" as const, message: "只有发起人能撤回" }
        };
      }
    } else {
      const stepRow = await tx.query<{ mode: StepMode }>(
        `select mode from approval_flow_steps where flow_id = $1 and step_order = $2`,
        [instance.flowId, instance.currentStepOrder]
      );
      if (!stepRow.rows[0]) {
        return {
          ok: false as const,
          failure: {
            code: "INVALID_TRANSITION" as const,
            message: "当前步骤在流程定义里已不存在，请联系管理员检查流程配置"
          }
        };
      }
      stepMode = stepRow.rows[0].mode;

      // V14-B：判权改为查参与人表，**不再回头查流程定义**。
      //
      // 参与人是提交时按流程定义解析好的，而流程定义可能在这张单审批期间
      // 被改过。按当前定义判权会让「提交时是审批人、现在不是了」的人批不了
      // 一张他本来该批的单——单据卡在那里，而卡住的原因在界面上看不出来。
      const participantRows = await tx.query<{ user_id: string; status: ParticipantStatus }>(
        `select user_id, status from approval_step_participants
          where instance_id = $1 and step_order = $2 for update`,
        [instance.id, instance.currentStepOrder]
      );
      currentParticipants = participantRows.rows;

      const mine = currentParticipants.find((p) => p.user_id === input.actor.userId);
      if (!mine) {
        return {
          ok: false as const,
          failure: { code: "NOT_AUTHORIZED" as const, message: "你不是当前步骤的审批人" }
        };
      }
      if (mine.status !== "pending") {
        // 会签里连点两次。不拦的话第二次会把「已满足」重算一遍——
        // 结果一样，但审批记录里会多一条，事后看不出到底批了几次。
        return {
          ok: false as const,
          failure: { code: "PARTICIPANT_ALREADY_ACTED" as const, message: "你已经处理过这一步了" }
        };
      }
    }

    // 先把自己那条参与人记录改掉，再算「本步骤是否满足」——顺序反了会让
    // 会签的最后一个人批完仍然算不满足，单据卡在最后一步。
    if (input.action !== "cancel") {
      await tx.query(
        `update approval_step_participants
            set status = $3, acted_at = now(), comment = $4
          where instance_id = $1 and step_order = $2 and user_id = $5`,
        [
          instance.id,
          instance.currentStepOrder,
          input.action === "approve" ? "approved" : "rejected",
          input.comment ?? null,
          input.actor.userId
        ]
      );
    }

    const afterAction = currentParticipants.map((p) =>
      p.user_id === input.actor.userId
        ? { status: (input.action === "approve" ? "approved" : "rejected") as ParticipantStatus }
        : { status: p.status }
    );

    let next: ApprovalInstanceState;
    try {
      next = applyApprovalAction(
        instance,
        input.action === "cancel"
          ? { action: "cancel" }
          : { action: input.action, stepOrder: instance.currentStepOrder! },
        input.action === "approve"
          ? { stepSatisfied: isStepSatisfied(stepMode, afterAction) }
          : {}
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
  // V14-B：改查参与人表。
  //
  // 原来是拿角色码去比流程定义，现在参与人在提交时就解析成了具体的人——
  // 于是这条查询变成一次简单的等值匹配，`roleCodes` 与 `directReportUserIds`
  // 都不再需要。**入参保留**：调用方还在传，删掉签名会波及一串路由，
  // 而多传两个用不上的参数不会出错。
  const rows = await query<InstanceDbRow>(
    `select i.id, i.company_id, i.flow_id, i.document_type, i.document_id,
            i.submitter_user_id, i.status, i.current_step_order,
            i.required_step_orders, i.amount_cents
       from approval_instances i
       join approval_step_participants p
         on p.instance_id = i.id and p.step_order = i.current_step_order
      where i.company_id = $1
        and i.status = 'pending'
        and p.user_id = $2
        -- 会签里已经批过的人不该还看到这条待办：他做完了，等的是别人。
        and p.status = 'pending'
      order by i.created_at`,
    [companyId, actor.userId]
  );
  return rows.map(mapInstance);
}

export interface StepParticipant {
  stepOrder: number;
  userId: string;
  status: ParticipantStatus;
  actedAt: string | null;
  comment: string | null;
  isAdded: boolean;
  addedByUserId: string | null;
}

/** 一个实例的全部参与人，供详情页显示「这一步还差谁」。 */
export async function listParticipants(instanceId: string): Promise<StepParticipant[]> {
  const rows = await query<{
    step_order: number;
    user_id: string;
    status: ParticipantStatus;
    acted_at: string | Date | null;
    comment: string | null;
    is_added: boolean;
    added_by_user_id: string | null;
  }>(
    `select step_order, user_id, status, acted_at, comment, is_added, added_by_user_id
       from approval_step_participants
      where instance_id = $1 order by step_order, created_at`,
    [instanceId]
  );
  return rows.map((row) => ({
    stepOrder: row.step_order,
    userId: row.user_id,
    status: row.status,
    actedAt:
      row.acted_at === null
        ? null
        : row.acted_at instanceof Date
          ? row.acted_at.toISOString()
          : String(row.acted_at),
    comment: row.comment,
    isAdded: row.is_added,
    addedByUserId: row.added_by_user_id
  }));
}

export interface AddParticipantInput {
  companyId: string;
  instanceId: string;
  targetUserId: string;
  actorUserId: string;
}

/**
 * 动态加签：往**当前步骤**拉一个人进来。
 *
 * ## 只能加到当前步骤
 *
 * 加到后面的步骤等于改流程，那该去改流程定义；加到前面的步骤等于让已经
 * 走过的环节重来，而「重来」需要决定已批过的人要不要重批——那是完整流程
 * 回溯的开销，与「驳回到任意中间节点」同一类，蓝图里明确不做。
 *
 * ## 只有当前步骤的参与人能加签
 *
 * 加签的语义是「这事我拿不准，得让 X 也看看」，说这句话的人必须是正在
 * 处理这一步的人。任何人都能加签的话，加签就成了往别人流程里塞人的工具。
 *
 * ## 效果取决于步骤模式
 *
 * 会签下多一个人要批；或签下多一个人**可以**批。两种都成立，
 * 不需要为加签单独定义语义。
 */
export async function addParticipant(
  input: AddParticipantInput
): Promise<ApprovalResult<StepParticipant[]>> {
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
    if (instance.status !== "pending" || instance.currentStepOrder === null) {
      return {
        ok: false as const,
        failure: {
          code: "INVALID_TRANSITION" as const,
          message: `审批已结束（${instance.status}），不能加签`
        }
      };
    }

    const actorRow = await tx.query<{ user_id: string }>(
      `select user_id from approval_step_participants
        where instance_id = $1 and step_order = $2 and user_id = $3`,
      [instance.id, instance.currentStepOrder, input.actorUserId]
    );
    if (!actorRow.rows[0]) {
      return {
        ok: false as const,
        failure: { code: "NOT_AUTHORIZED" as const, message: "只有当前步骤的审批人能加签" }
      };
    }

    await tx.query(
      `insert into approval_step_participants
         (id, instance_id, step_order, user_id, is_added, added_by_user_id)
       values ($1, $2, $3, $4, true, $5)
       -- 已经在这一步里的人再加一次是无操作。报错没有意义——
       -- 目的（这个人要参与）已经达成了。
       on conflict (instance_id, step_order, user_id) do nothing`,
      [
        `asp-${randomUUID()}`,
        instance.id,
        instance.currentStepOrder,
        input.targetUserId,
        input.actorUserId
      ]
    );

    const after = await tx.query<{
      step_order: number;
      user_id: string;
      status: ParticipantStatus;
      acted_at: string | Date | null;
      comment: string | null;
      is_added: boolean;
      added_by_user_id: string | null;
    }>(
      `select step_order, user_id, status, acted_at, comment, is_added, added_by_user_id
         from approval_step_participants
        where instance_id = $1 and step_order = $2 order by created_at`,
      [instance.id, instance.currentStepOrder]
    );

    return {
      ok: true as const,
      value: after.rows.map((p) => ({
        stepOrder: p.step_order,
        userId: p.user_id,
        status: p.status,
        actedAt:
          p.acted_at === null
            ? null
            : p.acted_at instanceof Date
              ? p.acted_at.toISOString()
              : String(p.acted_at),
        comment: p.comment,
        isAdded: p.is_added,
        addedByUserId: p.added_by_user_id
      }))
    };
  });
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

/**
 * 抄送给我的审批（V13 残留 4）。
 *
 * ## 为什么抄送需要一个独立入口
 *
 * 抄送人不是审批人——他不在待办里，也没有任何动作要做。但他被抄送正是因为
 * 「这件事你该知道」。没有入口的话，`approval_watchers` 写进去的记录没有任何
 * 消费方，抄送这个功能等于不存在。
 *
 * ## 已结束的也返回
 *
 * 与待办不同：待办只看 pending（没结束的才要处理），而抄送是「知会」——
 * 一张单批完了、被驳回了，抄送人同样该看到结果。只按 pending 过滤会让
 * 抄送人永远看不到最终结论。
 *
 * `readAt` 一并返回，供界面区分「新的」与「看过的」。
 */
export interface WatchedApproval extends ApprovalInstance {
  readAt: string | null;
}

export async function listWatchedBy(
  companyId: string,
  userId: string
): Promise<WatchedApproval[]> {
  const rows = await query<InstanceDbRow & { read_at: string | Date | null }>(
    `select i.id, i.company_id, i.flow_id, i.document_type, i.document_id,
            i.submitter_user_id, i.status, i.current_step_order,
            i.required_step_orders, i.amount_cents, w.read_at
       from approval_watchers w
       join approval_instances i on i.id = w.instance_id
      where w.user_id = $1 and i.company_id = $2
      order by w.read_at nulls first, i.created_at desc`,
    [userId, companyId]
  );
  return rows.map((row) => ({
    ...mapInstance(row),
    readAt:
      row.read_at === null
        ? null
        : typeof row.read_at === "string"
          ? row.read_at
          : row.read_at.toISOString()
  }));
}

/**
 * 标记抄送已读。
 *
 * 幂等：已读的再标一次不改时间——否则「什么时候看到的」这个信息会被
 * 每次打开页面刷掉，而它在争议时是有用的。
 */
export async function markWatchRead(instanceId: string, userId: string): Promise<void> {
  await query(
    `update approval_watchers set read_at = now()
      where instance_id = $1 and user_id = $2 and read_at is null`,
    [instanceId, userId]
  );
}
