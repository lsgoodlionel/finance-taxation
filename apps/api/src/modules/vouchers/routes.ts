import type { ServerResponse } from "node:http";
import {
  getVoucherApproverUserId,
  getVoucherForCompany,
  listCompanyLedgerEntries,
  listCompanyLedgerPostingBatches,
  listCompanyVoucherPostingRecords,
  listCompanyVouchers
} from "./voucher-queries.js";
import type {
  LedgerEntry,
  LedgerPostingBatch,
  Voucher,
  VoucherDraftLine,
  VoucherPostingRecord
} from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { toDateOnly } from "../../db/date-column.js";
import { json } from "../../utils/http.js";
import {
  buildVoucherTemplateDraft,
  listVoucherTemplates
} from "./templates.js";
import { writeAudit } from "../../services/audit.js";
import { notify } from "../notifications/dispatch.js";
import { buildVoucherApprovalNotification } from "../notifications/events.js";
import { isPeriodLocked } from "../ledger/routes.js";
import { validateWorkflowAuthorization } from "../workflows/authorization.js";
import { buildWorkflowCommandExecution, buildWorkflowRun, markWorkflowCommandStatus } from "../workflows/commands.js";
import {
  ensureWorkflowRun,
  findSuccessfulWorkflowCommandExecution,
  insertWorkflowCommandExecution,
  insertWorkflowTransition,
  updateWorkflowCommandExecution,
  updateWorkflowRunState
} from "../workflows/persistence.js";
import {
  buildWorkflowTransitionRecord,
  mapVoucherStatusToWorkflowState,
  validateWorkflowTransition
} from "../workflows/runtime.js";
import { buildReversalLines, canReverseVoucher } from "./reversal.js";
import { formatVoucherNumber, resolveVoucherWord, type VoucherWord } from "./voucher-number.js";
import { insertLedgerEntries } from "./ledger-writer.js";
import { SETTLEABLE_TYPE_CODES } from "../settlement/settleable-accounts.js";
import { isCostCenterApplicable } from "../cost-center/cost-center.js";
import { checkAccountsUsable } from "../accounts/account-guard.js";
import { BASE_CURRENCY, RATE_SCALE } from "../currency/revaluation.js";
import { resolveClosingRate } from "../currency/revaluation-store.js";
import { allocateForeignAmounts, foreignToBaseCents } from "../currency/foreign-allocation.js";
import { toCents } from "../../utils/money.js";

export async function listVouchers(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId") || undefined;
  const rows = await listCompanyVouchers(req.auth!.companyId, { businessEventId: eventId });
  return json(res, 200, { items: rows, total: rows.length });
}

export async function getVoucherTemplates(_req: ApiRequest, res: ServerResponse) {
  return json(res, 200, {
    items: listVoucherTemplates().map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description,
      voucherType: item.voucherType
    })),
    total: listVoucherTemplates().length
  });
}

export async function reverseVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }

  const meta = await queryOne<{ reverses_voucher_id: string | null; reversed_by: string | null }>(
    `
      select
        v.reverses_voucher_id,
        (
          select r.id from vouchers r
          where r.company_id = v.company_id and r.reverses_voucher_id = v.id
          limit 1
        ) as reversed_by
      from vouchers v
      where v.id = $1 and v.company_id = $2
    `,
    [voucherId, req.auth!.companyId]
  );
  const verdict = canReverseVoucher({
    status: target.status,
    postedAt: target.postedAt,
    reversesVoucherId: meta?.reverses_voucher_id ?? null,
    alreadyReversed: Boolean(meta?.reversed_by)
  });
  if (!verdict.ok) {
    return json(res, 409, { error: verdict.message, code: verdict.errorCode });
  }

  // 原凭证所在期间已锁账时不得再动它的账 —— 与过账同一条铁律。
  // 期间取原凭证总账分录的实际 entry_date，而不是"当前月"：跨月红冲用当前月判定
  // 会直接绕过对原期间的锁。
  const lockedPeriod = await queryOne<{ period: string }>(
    `
      select distinct to_char(le.entry_date, 'YYYY-MM') as period
      from ledger_entries le
      join accounting_periods ap
        on ap.company_id = le.company_id and ap.period = to_char(le.entry_date, 'YYYY-MM')
      where le.company_id = $1 and le.voucher_id = $2 and ap.is_locked
      limit 1
    `,
    [req.auth!.companyId, voucherId]
  );
  if (lockedPeriod) {
    return json(res, 409, {
      error: `原凭证所属会计期间 ${lockedPeriod.period} 已锁账，无法红冲。请先解锁该期间。`,
      code: "VOUCHER_PERIOD_LOCKED"
    });
  }

  const now = new Date().toISOString();
  const reversalId = `vch-rev-${voucherId}-${Date.now()}`;
  const reversalLines = buildReversalLines(target.lines);

  // 红冲沿用原凭证的科目，但原科目可能在这期间被停用了 —— 那样红冲凭证要等到
  // 过账时才失败，不如在生成这一步就说清楚。
  const reversalAccounts = await checkAccountsUsable(req.auth!.companyId, reversalLines);
  if (!reversalAccounts.ok) {
    return json(res, 400, { error: reversalAccounts.message, code: reversalAccounts.code });
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into vouchers (
          id, company_id, business_event_id, mapping_id, voucher_type, summary,
          status, source, reverses_voucher_id, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, 'draft', 'reversal', $7, $8::timestamptz, $8::timestamptz)
      `,
      [
        reversalId,
        target.companyId,
        target.businessEventId,
        target.mappingId,
        target.voucherType,
        `红冲：${target.summary}`,
        voucherId,
        now
      ]
    );
    for (const [index, line] of reversalLines.entries()) {
      await client.query(
        `
          insert into voucher_lines (
            id, voucher_id, summary, account_code, account_name, debit, credit, sort_order
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)
        `,
        [
          `${reversalId}-${index + 1}`,
          reversalId,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index
        ]
      );
    }
  });

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "reverse",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: target.summary,
    changes: { data: { reversalVoucherId: reversalId, lineCount: reversalLines.length } }
  });

  const created = await getVoucherForCompany(req.auth!.companyId, reversalId);
  return json(res, 201, created);
}

export async function getVoucherDetail(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const postingRecords = await listCompanyVoucherPostingRecords(req.auth!.companyId, target.id);
  return json(res, 200, {
    ...target,
    postingRecords
  });
}

export async function updateVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const body = (req.body || {}) as Partial<Voucher>;

  // 已入账凭证不得原地改写 —— 会计上只允许红冲。此前这里对 status/summary 一律
  // 照单全收，实机可把一张已过账凭证改回 draft 并改掉摘要，而它的总账分录仍留在
  // 账上；退回 draft 后再走一次过账，要么主键冲突报 500，要么重复记账。
  if (target.postedAt || target.status === "posted") {
    return json(res, 409, {
      error: "凭证已过账，不能修改。如需更正请使用红冲（POST /api/vouchers/:id/reverse）。",
      code: "VOUCHER_ALREADY_POSTED"
    });
  }

  const nextStatus = body.status ?? target.status;
  if (nextStatus !== target.status) {
    // 状态推进只能走各自的专用接口：approve 附带状态机校验并记录审核人，
    // post 附带借贷校验、职责分离、期间锁并生成总账分录。
    // 从这里改状态会跳过全部这些，最坏的情况是凭证显示已过账而账上根本没有分录。
    if (nextStatus === "posted") {
      return json(res, 400, {
        error: "不能直接把凭证改成已过账。过账请调用 POST /api/vouchers/:id/post，它才会生成总账分录。",
        code: "VOUCHER_STATUS_NOT_UPDATABLE"
      });
    }
    const validation = validateWorkflowTransition(
      mapVoucherStatusToWorkflowState(target.status),
      mapVoucherStatusToWorkflowState(nextStatus)
    );
    if (!validation.ok) {
      return json(res, 400, { error: validation.message, code: validation.errorCode });
    }
  }

  const updatedAt = new Date().toISOString();
  await queryOne(
    `
      update vouchers
      set
        status = $1,
        summary = $2,
        updated_at = $3::timestamptz
      where id = $4 and company_id = $5
      returning id
    `,
    [nextStatus, body.summary ?? target.summary, updatedAt, voucherId, req.auth!.companyId]
  );
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "update",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: target.summary,
    changes: {
      before: { status: target.status, summary: target.summary },
      after: { status: nextStatus, summary: body.summary ?? target.summary }
    }
  });
  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  return json(res, 200, updated);
}

export async function validateVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const debit = target.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = target.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const issues: string[] = [];
  if (!target.lines.length) {
    issues.push("凭证分录为空");
  }
  if (Math.abs(debit - credit) > 0.0001) {
    issues.push(`借贷不平，借方 ${debit.toFixed(2)}，贷方 ${credit.toFixed(2)}`);
  }
  if (target.lines.some((line) => !line.accountCode || !line.accountName)) {
    issues.push("存在未填写完整科目的分录");
  }
  return json(res, 200, {
    id: target.id,
    valid: issues.length === 0,
    totals: {
      debit: debit.toFixed(2),
      credit: credit.toFixed(2)
    },
    issues
  });
}

export async function approveVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const now = new Date().toISOString();
  const previousState = mapVoucherStatusToWorkflowState(target.status);
  const nextState = mapVoucherStatusToWorkflowState("review_required");
  const transitionValidation = validateWorkflowTransition(previousState, nextState);
  if (!transitionValidation.ok) {
    return json(res, 400, { error: transitionValidation.message, code: transitionValidation.errorCode });
  }
  await withTransaction(async (client) => {
    await client.query(
      `
        update vouchers
        set
          status = 'review_required',
          approved_at = $1::timestamptz,
          approved_by_user_id = $4,
          updated_at = $1::timestamptz
        where id = $2 and company_id = $3
      `,
      [now, voucherId, req.auth!.companyId, req.auth!.userId]
    );
    const run = await ensureWorkflowRun(
      client,
      buildWorkflowRun({
        companyId: req.auth!.companyId,
        workflowKey: "voucher.lifecycle",
        resourceType: "voucher",
        resourceId: voucherId,
        resourceLabel: target.summary,
        currentState: previousState,
        initiatorUserId: req.auth!.userId,
        initiatorName: req.auth!.username
      })
    );
    const transition = buildWorkflowTransitionRecord({
      companyId: req.auth!.companyId,
      workflowRunId: run.id,
      resourceType: "voucher",
      resourceId: voucherId,
      previousState,
      nextState,
      actorUserId: req.auth!.userId,
      actorName: req.auth!.username,
      basis: "voucher.approve",
      ruleVersion: "v4-1a"
    });
    await insertWorkflowTransition(client, transition);
    await updateWorkflowRunState(client, run.id, nextState, null, transition.occurredAt);
  });
  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "approve",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: target.summary,
    changes: { before: { status: target.status }, after: { status: "review_required" } }
  });
  // 送审即发即忘通知复核人；过账是本次审批的结果，不再重复推送。
  notify(
    buildVoucherApprovalNotification({
      companyId: req.auth!.companyId,
      voucherId,
      summary: target.summary,
      submittedBy: req.auth!.username,
      businessEventId: target.businessEventId ?? null
    })
  );
  return json(res, 200, updated);
}

export async function postVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  if (target.postedAt) {
    const [postingRecords, ledgerEntries, ledgerPostingBatches] = await Promise.all([
      listCompanyVoucherPostingRecords(req.auth!.companyId, target.id),
      listCompanyLedgerEntries(req.auth!.companyId, { voucherId: target.id }),
      listCompanyLedgerPostingBatches(req.auth!.companyId, target.id)
    ]);
    return json(res, 200, {
      ...target,
      postingRecords,
      ledgerEntries,
      ledgerPostingBatches
    });
  }

  const debit = target.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = target.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.abs(debit - credit) > 0.0001) {
    return json(res, 400, { error: "Voucher is not balanced" });
  }
  if (!target.approvedAt) {
    return json(res, 400, { error: "Voucher must be approved before posting" });
  }
  const body = (req.body || {}) as { authorizerUserId?: string; authorizerName?: string };
  // 终审人不默认当前用户：过账是高风险动作，规则要求终审人与执行人不同。
  // 默认成自己只会撞「执行人 == 终审人」冲突，报出的还是含糊的 DUTY_CONFLICT；
  // 留空则命中 WORKFLOW_AUTHORIZATION_REQUIRED，明确告诉调用方缺终审人。
  // 校验会保证到达后续流程时 authorizerUserId 必有值，故 name 直接跟随入参。
  const authorizerUserId = body.authorizerUserId;
  const authorizerName = body.authorizerName;

  // 复核人必须取自「谁审核的这张凭证」，不能拿当前用户顶替 —— 早前两个角色都填
  // req.auth.userId，而职责分离规则判定「复核人 == 过账人」即冲突，导致本接口对
  // 任何调用恒返回 400，过账功能实际不可用。
  // 迁移 043 之前审核的凭证没有审核人记录（NULL），此时跳过该项校验，否则存量凭证
  // 永远过不了账；终审人要求与审计留痕不受影响。
  const reviewerUserId = await getVoucherApproverUserId(req.auth!.companyId, voucherId);
  const authCheck = validateWorkflowAuthorization({
    action: "voucher.post",
    reviewerUserId: reviewerUserId ?? undefined,
    posterUserId: req.auth!.userId,
    executorUserId: req.auth!.userId,
    authorizerUserId
  });
  if (!authCheck.ok) {
    return json(res, 400, { error: authCheck.message, code: authCheck.errorCode });
  }
  const previousState = mapVoucherStatusToWorkflowState(target.status);
  const nextState = mapVoucherStatusToWorkflowState("posted");
  // 过账在状态机上是「开始执行 → 执行完成」两步。通用转移表刻意不允许 under_review
  // 一步跳到 completed（审核态不能直达终态），而凭证只有 draft/review_required/posted
  // 三个状态，审核后必然是 under_review —— 此前这里只校验 under_review -> completed，
  // 于是所有审核过的凭证 100% 被判 WORKFLOW_INVALID_TRANSITION，这是过账失效的第二道闸。
  // 拆成两步既贴合语义（过账就是执行动作），也让审计留下「执行中」的痕迹，
  // 且不必为凭证放宽一张对所有资源类型生效的通用转移表。
  const executingState = "executing" as const;
  for (const [from, to] of [
    [previousState, executingState],
    [executingState, nextState]
  ] as const) {
    const transitionValidation = validateWorkflowTransition(from, to);
    if (!transitionValidation.ok) {
      return json(res, 400, { error: transitionValidation.message, code: transitionValidation.errorCode });
    }
  }

  // postedAt 只是「什么时候点的过账按钮」，accountingDate 才是「这笔账归属哪个期间」。
  // 两者必须分开：6 月的业务 7 月过账，账要记在 6 月；期间锁也要按 6 月判，
  // 否则锁了 6 月仍能在 7 月补记 6 月的凭证（此前正是如此）。
  const postedAt = new Date().toISOString();
  const accountingDate = target.accountingDate;
  const voucherPeriod = accountingDate.slice(0, 7);
  if (await isPeriodLocked(req.auth!.companyId, voucherPeriod)) {
    return json(res, 400, { error: `会计期间 ${voucherPeriod} 已锁账，无法过账。请先解锁该期间。` });
  }
  // 过账前再校验一次科目：草稿可能建于科目停用之前，或由绕过创建接口的路径产生。
  // 这是分录进总账前的最后一道闸。
  const postingAccounts = await checkAccountsUsable(req.auth!.companyId, target.lines);
  if (!postingAccounts.ok) {
    return json(res, 400, { error: postingAccounts.message, code: postingAccounts.code });
  }

  // 凭证号在过账这一刻分配，不在创建时 —— 草稿不占号，否则删草稿会留下断号，
  // 而《会计基础工作规范》要求编号连续。序号在同一事务内用 max+1 取，
  // 并发安全由迁移 048 的部分唯一索引兜底（冲突则整个事务回滚，调用方重试）。
  const voucherWord = resolveVoucherWord(target.voucherType);

  const postingRecord: VoucherPostingRecord = {
    id: `post-${voucherId}-${Date.now()}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    postedByUserId: req.auth!.userId,
    postedByName: req.auth!.username,
    postedAt
  };
  const createdLedgerEntries: LedgerEntry[] = target.lines.map((line, index) => ({
    id: `ledger-${voucherId}-${index + 1}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    entryDate: accountingDate,
    summary: line.summary || target.summary,
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: line.debit,
    credit: line.credit,
    source: "voucher_posting",
    postedAt,
    // 往来维度随凭证行进总账（V12-C2）。凭证行没填就是 null——非往来科目本就
    // 不该有，往来科目漏填的后果是这笔进不了账龄表，由 settlement 侧提示补录。
    counterpartyId: line.counterpartyId ?? null,
    // 成本中心维度同理（V12-D1）：漏填的后果是落进部门费用报表的「未指定」一行。
    costCenterId: line.costCenterId ?? null,
    // 外币原币随凭证行进总账（V12-D5）。丢在这一步的话，账上就只剩折算后的本位币
    // 金额，期末调汇拿不到外币余额、也回答不了「当初按什么汇率入的账」。
    currency: line.currency ?? BASE_CURRENCY,
    originalAmount: line.originalAmount ?? null,
    exchangeRate: line.exchangeRate ?? null
  }));
  const createdBatch: LedgerPostingBatch = {
    id: `ledger-batch-${voucherId}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    entryIds: createdLedgerEntries.map((item) => item.id),
    postedAt
  };

  await withTransaction(async (client) => {
    await client.query(
      `
        update vouchers
        set
          status = 'posted',
          posted_at = $1::timestamptz,
          updated_at = $1::timestamptz,
          period = $4,
          voucher_word = $5,
          voucher_seq = coalesce(
            (
              select max(v2.voucher_seq) + 1
              from vouchers v2
              where v2.company_id = $3
                and v2.period = $4
                and v2.voucher_word = $5
                and v2.status = 'posted'
            ),
            1
          )
        where id = $2 and company_id = $3
      `,
      [postedAt, voucherId, req.auth!.companyId, voucherPeriod, voucherWord]
    );

    await client.query(
      `
        delete from ledger_posting_batch_entries
        where batch_id in (
          select id from ledger_posting_batches
          where company_id = $1 and voucher_id = $2
        )
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from ledger_posting_batches
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from ledger_entries
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from voucher_posting_records
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );

    await client.query(
      `
        insert into voucher_posting_records (
          id,
          company_id,
          voucher_id,
          business_event_id,
          posted_by_user_id,
          posted_by_name,
          posted_at
        ) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      `,
      [
        postingRecord.id,
        postingRecord.companyId,
        postingRecord.voucherId,
        postingRecord.businessEventId,
        postingRecord.postedByUserId,
        postingRecord.postedByName,
        postingRecord.postedAt
      ]
    );

    // 总账写入统一走 ledger-writer —— 期末结转也用同一个函数，
    // 「凭证是唯一入账口径」这个不变式才不是口头约定。
    await insertLedgerEntries(client, createdLedgerEntries);

    await client.query(
      `
        insert into ledger_posting_batches (
          id,
          company_id,
          voucher_id,
          business_event_id,
          posted_at
        ) values ($1, $2, $3, $4, $5::timestamptz)
      `,
      [
        createdBatch.id,
        createdBatch.companyId,
        createdBatch.voucherId,
        createdBatch.businessEventId,
        createdBatch.postedAt
      ]
    );

    for (const entryId of createdBatch.entryIds) {
      await client.query(
        `
          insert into ledger_posting_batch_entries (batch_id, entry_id)
          values ($1, $2)
        `,
        [createdBatch.id, entryId]
      );
    }
    const reusable = await findSuccessfulWorkflowCommandExecution(req.auth!.companyId, {
      commandType: "voucher.post",
      resourceType: "voucher",
      resourceId: voucherId,
      idempotencyKey: `voucher-post:${voucherId}:${target.updatedAt}`,
      objectVersion: target.updatedAt
    });
    if (!reusable) {
      const run = await ensureWorkflowRun(
        client,
        buildWorkflowRun({
          companyId: req.auth!.companyId,
          workflowKey: "voucher.lifecycle",
          resourceType: "voucher",
          resourceId: voucherId,
          resourceLabel: target.summary,
          currentState: previousState,
          initiatorUserId: req.auth!.userId,
          initiatorName: req.auth!.username,
          authorizerUserId,
          authorizerName
        })
      );
      // 与上面的两步校验一一对应：先记「开始过账」，再记「过账完成」。
      const startTransition = buildWorkflowTransitionRecord({
        companyId: req.auth!.companyId,
        workflowRunId: run.id,
        resourceType: "voucher",
        resourceId: voucherId,
        previousState,
        nextState: executingState,
        actorUserId: req.auth!.userId,
        actorName: req.auth!.username,
        basis: "voucher.post.start",
        ruleVersion: "v4-1a"
      });
      const transition = buildWorkflowTransitionRecord({
        companyId: req.auth!.companyId,
        workflowRunId: run.id,
        resourceType: "voucher",
        resourceId: voucherId,
        previousState: executingState,
        nextState,
        actorUserId: req.auth!.userId,
        actorName: req.auth!.username,
        basis: "voucher.post",
        ruleVersion: "v4-1a"
      });
      const command = buildWorkflowCommandExecution({
        companyId: req.auth!.companyId,
        workflowRunId: run.id,
        commandType: "voucher.post",
        resourceType: "voucher",
        resourceId: voucherId,
        idempotencyKey: `voucher-post:${voucherId}:${target.updatedAt}`,
        objectVersion: target.updatedAt,
        inputSnapshot: { voucherId, lineCount: target.lines.length, businessEventId: target.businessEventId },
        initiatorUserId: req.auth!.userId,
        initiatorName: req.auth!.username,
        executorUserId: req.auth!.userId,
        executorName: req.auth!.username,
        authorizerUserId,
        authorizerName
      });
      const running = markWorkflowCommandStatus(command, "running", { progress: "posting_voucher" });
      await insertWorkflowTransition(client, startTransition);
      await insertWorkflowTransition(client, transition);
      await insertWorkflowCommandExecution(client, running);
      await updateWorkflowCommandExecution(
        client,
        markWorkflowCommandStatus(running, "succeeded", {
          progress: "posted",
          resultSnapshot: {
            postedAt,
            entryCount: createdLedgerEntries.length,
            batchId: createdBatch.id
          }
        })
      );
      await updateWorkflowRunState(client, run.id, nextState, null, postedAt);
    }
  });

  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "post",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: target.summary,
    changes: { data: { postedAt, entryCount: createdLedgerEntries.length } }
  });
  return json(res, 200, {
    ...updated,
    postingRecords: [postingRecord],
    ledgerEntries: createdLedgerEntries,
    ledgerPostingBatches: [createdBatch]
  });
}

export async function listVoucherPostingRecords(
  req: ApiRequest,
  res: ServerResponse,
  voucherId: string
) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const rows = await listCompanyVoucherPostingRecords(req.auth!.companyId, voucherId);
  return json(res, 200, { items: rows, total: rows.length });
}
