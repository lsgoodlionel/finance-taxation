/**
 * 「当前这个申报批次走到哪了」的纯推导。
 *
 * 替代原来的 ProcessFlowStageSection：那里的 currentNodeId 是页面写死的
 * （有留档记录就指向归档查询节点，否则指向税务申报留档节点），跟用户手上这一笔
 * 的真实进度无关，看了也不知道下一步该干什么。
 *
 * 这里的每一步状态都来自批次的真实字段：
 * - 校验：批次状态是否已经是 ready/submitted/archived（后端按「批次内事项是否全部
 *   ready」定状态），叠加本次页面上跑出来的校验结论；
 * - 提交：状态是否 submitted/archived；
 * - 复核：是否存在 approved 的 TaxFilingBatchReviewRecord；
 * - 留档：是否存在 TaxFilingBatchArchiveRecord（或状态已 archived）。
 *
 * 状态推进规则（第一个未完成的是 current、其后一律 pending）由
 * lib/object-flow.ts 的 buildObjectFlow 统一负责，本模块只回答「每一步做完没、
 * 卡在什么上」。
 */
import { buildObjectFlow, type FlowRelatedObject, type ObjectFlow } from "../../lib/object-flow";
import type { TaxBatchDetail } from "./taxTypes";

export interface TaxBatchValidation {
  valid: boolean;
  issues: string[];
  itemCount: number;
}

/** 流程条里最多挂几个税务事项链接：再多就把一行细排步骤挤成一堵墙。 */
const MAX_RELATED_ITEMS = 6;

const OWNER_TAX_STAFF = "税务专员";
const OWNER_REVIEWER = "复核人 / 财务负责人";

function isValidated(status: TaxBatchDetail["status"]): boolean {
  return status === "ready" || status === "submitted" || status === "archived";
}

function isSubmitted(status: TaxBatchDetail["status"]): boolean {
  return status === "submitted" || status === "archived";
}

/**
 * 批次内的税务事项 → 可跳转的关联对象（全量）。
 * 流程条只挂前几条（见 MAX_RELATED_ITEMS），完整清单交给默认收起的关联面板，
 * 这样「一眼看到进度」和「顺藤摸瓜查全部」各得其所。
 */
export function buildBatchItemLinks(detail: TaxBatchDetail): FlowRelatedObject[] {
  return detail.items.map((item) => ({
    kind: "tax_item" as const,
    id: item.id,
    label: item.id
  }));
}

function resolveValidateBlockedReason(
  detail: TaxBatchDetail,
  validation: TaxBatchValidation | null
): string | null {
  if (validation && !validation.valid) {
    return validation.issues.length > 0 ? validation.issues.join("；") : "校验未通过";
  }
  if (detail.status === "review_required") {
    return "批次里还有没准备好的税务事项，先在税务事项里处理";
  }
  if (detail.status === "draft") {
    return "批次还是草稿，先跑一次校验";
  }
  return null;
}

function resolveReviewBlockedReason(detail: TaxBatchDetail): string | null {
  const latest = detail.reviews[0] ?? null;
  if (latest && latest.reviewResult === "rejected") {
    return latest.reviewNotes ? `上一次复核没通过：${latest.reviewNotes}` : "上一次复核没通过，需要改完再报一次";
  }
  return null;
}

/**
 * 由批次详情推导流程视图；没有选中批次时返回 null（页面据此改提示语，不画空条）。
 */
export function buildTaxBatchFlow(
  detail: TaxBatchDetail | null,
  validation: TaxBatchValidation | null = null
): ObjectFlow | null {
  if (!detail) {
    return null;
  }

  const itemLinks = buildBatchItemLinks(detail).slice(0, MAX_RELATED_ITEMS);

  return buildObjectFlow([
    {
      key: "validate",
      label: "校验批次",
      // 已提交的批次定义上就过了校验；未提交时才让本次校验结论有否决权，
      // 免得「校验红了但状态显示已提交」这种自相矛盾的流程条。
      done: isSubmitted(detail.status) || (isValidated(detail.status) && validation?.valid !== false),
      blockedReason: resolveValidateBlockedReason(detail, validation),
      related: itemLinks,
      owner: OWNER_TAX_STAFF
    },
    {
      key: "submit",
      label: "提交申报",
      done: isSubmitted(detail.status),
      owner: OWNER_TAX_STAFF
    },
    {
      key: "review",
      label: "税务复核",
      done: detail.reviews.some((record) => record.reviewResult === "approved"),
      blockedReason: resolveReviewBlockedReason(detail),
      owner: OWNER_REVIEWER
    },
    {
      key: "archive",
      label: "留档备查",
      done: detail.archives.length > 0 || detail.status === "archived",
      owner: OWNER_TAX_STAFF
    }
  ]);
}

/** 流程条的标题：带上批次本身，避免和全站导航条混淆。 */
export function buildTaxBatchFlowTitle(detail: TaxBatchDetail | null): string {
  if (!detail) {
    return "这个批次办到哪了";
  }
  return `这个批次办到哪了 · ${detail.taxType} ${detail.filingPeriod}`;
}
