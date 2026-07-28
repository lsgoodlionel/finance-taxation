/**
 * 「这张凭证走到哪了」的纯推导。
 *
 * 替代原来的 ProcessFlowStageSection：那块用假数据喂 resolveProcessFlowContext——
 * 页面现造了 `{ id: `${detail.id}-task-stage` }`、`{ id: ...-document-stage }`
 * 这类占位对象当作「任务」和「单据」传进去，于是无论选中哪张凭证，算出来的阶段
 * 基本恒定，看了不知道下一步该干什么。
 *
 * 这里每一步的状态都来自凭证的真实字段：
 * - 起草：凭证存在即已起草（createdAt）；
 * - 校验借贷：状态已过 draft 即定义上过了校验，仍是 draft 时才由本次页面上跑出来的
 *   校验结论说话；
 * - 审核：状态为 review_required / posted（即 approvedAt 已落）；
 * - 过账：状态为 posted（postedAt 已落）；
 * - 进报表：见下方 REPORT_STEP 的说明，这一步刻意不挂对象级链接。
 *
 * 「哪一步是当前、哪些还没轮到」由 lib/object-flow.ts 的 buildObjectFlow 统一负责；
 * 「当前这步该点什么按钮」由 voucher-actions.ts 的 resolveNextAction 统一负责——
 * 本模块不另起一套判定，两处口径必须是同一份。
 */
import type { Voucher, VoucherStatus } from "@finance-taxation/domain-model";
import { buildObjectFlow, type FlowRelatedObject, type ObjectFlow } from "../../lib/object-flow";
import { NEXT_ACTION_LABELS, resolveNextAction } from "./voucher-actions";

export interface VoucherValidationResult {
  valid: boolean;
  totals: { debit: string; credit: string };
  issues: string[];
}

/** 流程条要用到的凭证字段——比 VoucherDetail 宽松，便于单测与复用。 */
export type VoucherFlowSource = Pick<
  Voucher,
  "id" | "businessEventId" | "status" | "createdAt" | "approvedAt" | "postedAt"
>;

const OWNER_PREPARER = "制单会计";
const OWNER_REVIEWER = "复核会计";
const OWNER_SYSTEM = "系统按期间归集";

/** 审核过的凭证：状态机里 draft 之后就是「已审核、待过账」。 */
function isApproved(status: VoucherStatus): boolean {
  return status === "review_required" || status === "posted";
}

function isPosted(status: VoucherStatus): boolean {
  return status === "posted";
}

function resolveValidateBlockedReason(
  status: VoucherStatus,
  validation: VoucherValidationResult | null
): string | null {
  // 已经审核过的凭证再显示「借贷不平」只会自相矛盾：那张校验结果属于改动前。
  if (isApproved(status)) {
    return null;
  }
  if (validation && !validation.valid) {
    return validation.issues.length > 0 ? validation.issues.join("；") : "借贷校验未通过，请检查分录";
  }
  return null;
}

/**
 * 「进报表」这一步为什么不挂链接：
 *
 * 报表快照（ReportSnapshot）在数据层只有 reportType / periodType / periodLabel，
 * 没有任何字段回指凭证或分录——凭证是按期间被归集进报表的，不存在「这张凭证对应
 * 哪张报表」的对象级关联。所以这里只如实说「按期间归集」，不造一条假的对象链接；
 * 想去看报表，由页面给一个按期间的入口（见 buildVoucherReportPeriod）。
 */
const REPORT_STEP_LABEL = "按期间进报表";

/** 这张凭证归在哪个会计期间（YYYY-MM）：以过账日为准，未过账时用制单日预估。 */
export function buildVoucherReportPeriod(voucher: VoucherFlowSource | null): string | null {
  const stamp = voucher?.postedAt ?? voucher?.createdAt ?? null;
  if (!stamp || stamp.length < 7) {
    return null;
  }
  return stamp.slice(0, 7);
}

/**
 * 由凭证推导流程视图；没有选中凭证时返回 null（页面据此改提示语，不画空条）。
 */
export function buildVoucherFlow(
  voucher: VoucherFlowSource | null,
  validation: VoucherValidationResult | null = null
): ObjectFlow | null {
  if (!voucher) {
    return null;
  }

  const eventLink: FlowRelatedObject[] = voucher.businessEventId
    ? [{ kind: "business_event", id: voucher.businessEventId, label: voucher.businessEventId }]
    : [];

  return buildObjectFlow([
    {
      key: "draft",
      label: "起草凭证",
      done: true,
      related: eventLink,
      owner: OWNER_PREPARER
    },
    {
      key: "validate",
      label: "校验借贷",
      done: isApproved(voucher.status) || validation?.valid === true,
      blockedReason: resolveValidateBlockedReason(voucher.status, validation),
      owner: OWNER_PREPARER
    },
    {
      key: "approve",
      label: "审核",
      done: isApproved(voucher.status) || Boolean(voucher.approvedAt),
      owner: OWNER_REVIEWER
    },
    {
      key: "post",
      label: "过账进总账",
      done: isPosted(voucher.status) || Boolean(voucher.postedAt),
      owner: OWNER_REVIEWER
    },
    {
      key: "report",
      label: REPORT_STEP_LABEL,
      // 过账即被本期报表归集，没有额外的人工动作，因此与过账同步完成。
      done: isPosted(voucher.status) || Boolean(voucher.postedAt),
      owner: OWNER_SYSTEM
    }
  ]);
}

/** 流程条标题：带上凭证本身，避免和全站导航条、别的对象流程条混淆。 */
export function buildVoucherFlowTitle(voucher: VoucherFlowSource | null): string {
  if (!voucher) {
    return "这张凭证办到哪了";
  }
  return `这张凭证办到哪了 · ${voucher.id.slice(-8).toUpperCase()}`;
}

export interface VoucherNextStep {
  /** 按钮文案，直接复用 voucher-actions 的动作词表。 */
  label: string;
  /** 没有下一步（已过账）时为 true，页面据此禁用按钮。 */
  done: boolean;
}

/**
 * 当前这张凭证的下一步。
 *
 * 口径完全来自 resolveNextAction —— 改造前它只绑在快捷键 a 上，UI 上没有任何显式
 * 的「下一步」按钮，鼠标用户根本不知道系统认为该干什么。这里把同一个判定搬到界面上，
 * 不复制一份状态机。
 */
export function buildVoucherNextStep(voucher: VoucherFlowSource | null): VoucherNextStep | null {
  if (!voucher) {
    return null;
  }
  const action = resolveNextAction(voucher.status);
  return { label: NEXT_ACTION_LABELS[action], done: action === "none" };
}
