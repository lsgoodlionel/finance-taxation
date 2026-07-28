/**
 * 「这个对象在审计日志里走过哪几步」——纯逻辑。
 *
 * 与 components/FinanceFlowBar 的区别见 lib/object-flow.ts 的抬头。这里要补一条
 * 本页特有的纪律：**每一步都必须对应一个后端真的会写进 audit_logs 的 action**，
 * 步骤完成与否只看「这个对象的日志里出现过这个 action 没有」，不看任何别的推断。
 *
 * 下面三种对象类型的顺序不是设计出来的，是后端强制的（逐条核对过写入点）：
 * - voucher：approve → post。POST 接口有硬校验
 *   `if (!target.approvedAt) return 400 "Voucher must be approved before posting"`
 *   （modules/vouchers/routes.ts）。注意**没有 create 这一步**：建单不写审计日志，
 *   凭证的 writeAudit 只有 approve / post / reverse 三个 action，所以这里绝不
 *   画「创建凭证」——画了就是一个永远停在第一步的假流程。
 * - payroll：compute → confirm（modules/payroll/routes.ts 的两处 writeAudit）。
 * - payroll_transfer_batch：batch_built → batch_approved → file_generated →
 *   disbursed。状态机同样强制（`if (batch.status !== "exported") throw 仅已导出
 *   批次可标记代发完成`，modules/payroll/transfer.ts）。
 *
 * 刻意**不画**流程的类型，以及原因：
 * - business_event：审计动作只有 create 和两个 ai.* 分析动作，AI 分析是可选的，
 *   把它画成 pending 步骤等于告诉用户「还差一步没做」，其实不差。
 * - contract：只有 create 和 close 两个动作。一份正常在履行的合同并不是「卡在
 *   关闭这一步」，画出来是误导。
 * - export_job / invoice / knowledge_item / task 等：动作之间没有后端强制的先后，
 *   属于并列事件流，不是流程。
 * - document / tax_item / risk_finding：这三类现在**确实会留痕**了（写入点见
 *   audit-resource-types.ts 的清单注释），但同样不画流程，理由和 contract 一样：
 *   单据的归档、税务事项的改口径、风险发现的关闭都不是「还差一步没做」——
 *   一份正在履行的单据画成卡在归档那步，是误导。
 *
 * reverse（凭证冲红）也没有画进流程：它是对已过账凭证的纠错，不是第三步。
 */
import { buildObjectFlow, type ObjectFlow } from "../../lib/object-flow";

interface AuditFlowStepDef {
  key: string;
  /** 白话步骤名。 */
  label: string;
  /** 完成该步骤的 audit_logs.action 取值（多个取值任一命中即算完成）。 */
  actions: readonly string[];
}

/** 有后端强制顺序、因而可以如实画成流程的对象类型。 */
export const AUDITED_SEQUENCES: Readonly<Record<string, readonly AuditFlowStepDef[]>> = {
  voucher: [
    { key: "approve", label: "审核通过", actions: ["approve"] },
    { key: "post", label: "记入总账", actions: ["post"] }
  ],
  payroll: [
    { key: "compute", label: "算出这期工资", actions: ["compute"] },
    { key: "confirm", label: "确认工资表", actions: ["confirm"] }
  ],
  payroll_transfer_batch: [
    { key: "built", label: "生成代发批次", actions: ["payroll.transfer.batch_built"] },
    { key: "approved", label: "批次审批", actions: ["payroll.transfer.batch_approved"] },
    { key: "exported", label: "导出代发文件", actions: ["payroll.transfer.file_generated"] },
    { key: "disbursed", label: "标记已代发", actions: ["payroll.transfer.disbursed"] }
  ]
};

export function hasAuditedSequence(resourceType: string): boolean {
  return Object.prototype.hasOwnProperty.call(AUDITED_SEQUENCES, resourceType);
}

export interface AuditFlowLog {
  action: string;
  resourceId: string | null;
}

export interface AuditFlowInput {
  resourceType: string;
  resourceId: string;
  /** 当前屏上的日志行。 */
  logs: readonly AuditFlowLog[];
  /** 后端报告的命中总数。 */
  total: number;
  /** 每页条数。 */
  limit: number;
  /** 当前页偏移。 */
  offset: number;
}

/**
 * 推导流程；无法**如实**推导时返回 null（调用方据此不渲染流程条）。
 *
 * 返回 null 的三种情况：
 * 1. 没指定具体对象——流程的主语都不存在；
 * 2. 该类型没有后端强制的顺序（见上文清单）；
 * 3. 屏上的日志不是该对象的全集（翻到了第二页，或命中数超过一页）。
 *    第 3 条最容易被忽略却最要命：审计日志按时间倒序分页，「审核」那条完全可能
 *    落在下一页，此时按屏上数据推导会把一张已过账的凭证画成「还没审核」——
 *    一个骗人的流程条比没有流程条糟糕得多。
 */
export function buildAuditTrailFlow(input: AuditFlowInput): ObjectFlow | null {
  const { resourceType, resourceId, logs, total, limit, offset } = input;

  if (!resourceId) return null;

  const sequence = AUDITED_SEQUENCES[resourceType];
  if (!sequence) return null;

  const isCompleteOnScreen = offset === 0 && total <= limit;
  if (!isCompleteOnScreen) return null;

  const doneActions = new Set(
    logs.filter((log) => log.resourceId === resourceId).map((log) => log.action)
  );

  return buildObjectFlow(
    sequence.map((step) => ({
      key: step.key,
      label: step.label,
      done: step.actions.some((action) => doneActions.has(action))
    }))
  );
}

/** 流程条标题，带上对象本身，避免和全站导航条混淆。 */
export function buildAuditFlowTitle(resourceId: string): string {
  return `${resourceId} 走到哪了（依据它自己的审计记录）`;
}
