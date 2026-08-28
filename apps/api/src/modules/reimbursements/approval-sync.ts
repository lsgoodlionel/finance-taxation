/**
 * 把报销单的状态流转接到审批引擎上（V16）。
 *
 * ## 为什么需要这一层
 *
 * 审批引擎（`modules/approval`）写得很完整：多级流程、金额门槛、会签/或签、
 * 动态加签、参与人解析、审计留痕。而 `submitForApproval` **全仓只有它自己的
 * 测试在调用**——业务单据从来没启动过它。
 *
 * 后果是：公司在系统里配好的审批流从提交那一刻起就被绕过，
 * `approval_instances` 里没有报销单的记录，「我的审批」对谁都是空的，
 * 没有任何人被通知。V16 角色实验里员工提交了一张 2420 元、住宿已超标的报销单，
 * 而公司那条启用的流程 `afl-seed-cmp-v4-tech` 完全没有反应。
 *
 * ## 两个方向都要接
 *
 * 只在提交时建实例是不够的：approve/reject 不推进实例的话，
 * 待办列表里会堆着一批早就处理完的单子——换一种幽灵而已。
 *
 * ## 没配审批流怎么办
 *
 * **不阻塞提交**。直接拒绝会让所有还没配流程的公司交不了报销单，
 * 那是把一次缺陷修复做成一次故障。这里如实返回一句提示，
 * 让调用方告诉用户「本公司没有配审批流，这张单会由有审批权限的人直接处理」——
 * 用户知道发生了什么，比静默走掉好。
 */

import { act, findInstanceByDocument, submitForApproval } from "../approval/store.js";

export interface ApprovalSyncInput {
  companyId: string;
  documentId: string;
  /** 报销单刚刚执行的动作。 */
  action: string;
  /** 操作人。审批引擎按参与人表判定「这个人是不是当前步骤的审批人」。 */
  actor: { userId: string; roleCodes: readonly string[] };
  amountCents: number;
}

export interface ApprovalSyncNotice {
  /** 审批流是否真的在跟进这张单据。false = 公司没配流程，走的是直接处理。 */
  tracked: boolean;
  /** 给用户看的一句话。没有要说的时候是 null。 */
  message: string | null;
}

const DOCUMENT_TYPE = "reimbursement" as const;

/**
 * 同步审批实例。
 *
 * **失败不抛错**：审批实例是流程编排，报销单本身的状态已经落库了。
 * 让同步失败去回滚一次成功的业务动作，会把小问题放大成大问题。
 * 但也不静默——把情况如实带回给调用方。
 */
export async function syncApprovalInstance(
  input: ApprovalSyncInput
): Promise<ApprovalSyncNotice> {
  try {
    if (input.action === "submit") {
      const submitted = await submitForApproval({
        companyId: input.companyId,
        documentType: DOCUMENT_TYPE,
        documentId: input.documentId,
        submitterUserId: input.actor.userId,
        amountCents: input.amountCents
      });

      if (submitted.ok) {
        return { tracked: true, message: "已按公司审批流程提交，等待审批人处理。" };
      }

      // 没配流程不是错误，是这家公司还没做这项配置。
      if (submitted.failure.code === "FLOW_NOT_FOUND") {
        return {
          tracked: false,
          message:
            "本公司还没有配置报销审批流程，这张单据将由有费用审批权限的同事直接处理。" +
            "需要多级审批的话，请到系统设置里配置审批流。"
        };
      }

      // 配了流程但没有适用的步骤（例如每一级都设了金额门槛而本单金额太低）。
      // 引擎刻意不自动放行——静默通过会让「审批流形同虚设」没人发现。
      return { tracked: false, message: submitted.failure.message };
    }

    if (input.action !== "approve" && input.action !== "reject") {
      return { tracked: false, message: null };
    }

    const instance = await findInstanceByDocument(
      input.companyId,
      DOCUMENT_TYPE,
      input.documentId
    );
    // 提交时没建实例（公司没配流程），这里自然也没有可推进的——不是错。
    if (!instance || instance.status !== "pending") {
      return { tracked: false, message: null };
    }

    const acted = await act({
      companyId: input.companyId,
      instanceId: instance.id,
      actor: input.actor,
      action: input.action === "approve" ? "approve" : "reject",
      comment: `由报销单 ${input.documentId} 的${input.action === "approve" ? "批准" : "驳回"}动作同步`
    });

    if (!acted.ok) {
      // 常见于「这个人不是当前步骤的审批人」。报销单那边已经放行了
      // （它有自己的权限校验），这里如实说明审批流没跟上，而不是假装同步成功。
      return {
        tracked: false,
        message: `审批流程未同步：${acted.failure.message}`
      };
    }

    return { tracked: true, message: null };
  } catch (error) {
    // 同步失败不回滚业务动作，但要留下痕迹让人能查。
    return {
      tracked: false,
      message: `审批流程同步失败：${error instanceof Error ? error.message : String(error)}`
    };
  }
}
