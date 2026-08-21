/**
 * 按模板生成凭证（V15/P3 自 routes.ts 拆出）。
 *
 * 300 行的科目映射、金额分摊与校验，和 HTTP 层没有关系，却一直挤在路由文件中间。
 */
import {
  query,
  queryOne,
  withTransaction
} from "../../db/client.js";
import {
  toDateOnly
} from "../../db/date-column.js";
import {
  ApiRequest
} from "../../types.js";
import {
  json
} from "../../utils/http.js";
import {
  toCents
} from "../../utils/money.js";
import {
  checkAccountsUsable
} from "../accounts/account-guard.js";
import {
  allocateForeignAmounts,
  foreignToBaseCents
} from "../currency/foreign-allocation.js";
import {
  resolveClosingRate
} from "../currency/revaluation-store.js";
import {
  BASE_CURRENCY,
  RATE_SCALE
} from "../currency/revaluation.js";
import {
  buildVoucherTemplateDraft
} from "./templates.js";
import type {
  Voucher
} from "@finance-taxation/domain-model";
import {
  ServerResponse
} from "node:http";
import { getVoucherForCompany } from "./voucher-queries.js";
import { attachCostCenter, attachCounterparty } from "./voucher-rows.js";
export async function createVoucherFromTemplate(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as {
    templateKey?: string;
    amount?: string;
    summary?: string;
    businessEventId?: string;
    /**
     * 外币业务（V12-D5）。填了 currency 就按业务发生日的汇率折算：
     * `amount` 被当作**原币**金额，模板拿到的是折算后的本位币金额。
     *
     * 不填则一切照旧走本位币，既有调用方零感知。
     */
    currency?: string;
    /**
     * 成本中心（V12-D1）。填了就贴给凭证里适用的费用行，不填则那些行落进
     * 部门费用报表的「未指定」分组。
     */
    costCenterId?: string;
    /**
     * 往来单位（V12-C2）。**覆盖**从业务事项继承的那个值——事项建的时候可能还
     * 不知道对方是谁（比如先记一笔待认领的收款），记账时才补得上。
     */
    counterpartyId?: string;
  };
  if (!body.templateKey || !body.amount || !body.businessEventId) {
    return json(res, 400, { error: "templateKey, amount and businessEventId are required" });
  }

  // 一并取业务发生日：它是这张凭证的会计日期来源，决定账记在哪个期间。
  // 一并取往来单位：事件上早就记了它（business_events.counterparty_id），
  // 凭证由事件生成，理应继承，而不是让用户在凭证上再填一次同一个客户。
  const event = await queryOne<{ id: string; occurred_on: string | Date; counterparty_id: string | null }>(
    `
      select id, occurred_on, counterparty_id
      from business_events
      where id = $1 and company_id = $2
    `,
    [body.businessEventId, req.auth!.companyId]
  );
  if (!event) {
    return json(res, 404, { error: "Business event not found" });
  }

  // ── 外币折算（V12-D5）────────────────────────────────────────────
  //
  // 汇率取**业务发生日**或之前最近一天，而不是「今天」：一张 3 月的凭证在 6 月补录，
  // 该用的是 3 月的汇率。这与调汇取「资产负债表日或之前最近一天」是同一个原则。
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const isForeign = currency !== "" && currency !== BASE_CURRENCY;
  let exchangeRate = RATE_SCALE;
  let foreignTotalCents = 0;

  if (isForeign) {
    const eventDate = toDateOnly(event.occurred_on) ?? new Date().toISOString().slice(0, 10);
    const resolved = await withTransaction((client) =>
      resolveClosingRate(client, req.auth!.companyId, currency, eventDate)
    );
    if (resolved === null) {
      return json(res, 400, {
        error: `缺少 ${currency} 在 ${eventDate} 或之前的汇率，请先在总账「做期末外币调汇」里维护汇率。`,
        code: "EXCHANGE_RATE_MISSING"
      });
    }
    exchangeRate = resolved;
    foreignTotalCents = toCents(body.amount);
    if (!Number.isFinite(foreignTotalCents) || foreignTotalCents <= 0) {
      return json(res, 400, { error: "外币金额必须大于 0", code: "AMOUNT_INVALID" });
    }
  }

  // 模板拿到的始终是**本位币**金额：模板体系与科目口径都按本位币设计，
  // 让它感知币种会把外币逻辑扩散到每一个模板里。
  const templateAmount = isForeign
    ? (foreignToBaseCents(foreignTotalCents, exchangeRate) / 100).toFixed(2)
    : body.amount;

  let draft;
  try {
    draft = buildVoucherTemplateDraft({
      templateKey: body.templateKey,
      amount: templateAmount,
      summary: body.summary,
      businessEventId: body.businessEventId,
      companyId: req.auth!.companyId
    });
  } catch (error) {
    return json(res, 400, { error: (error as Error).message });
  }

  // 外币时把原币总额按各行本位币比例分摊（末行扫尾），保证借贷两侧的原币之和都
  // 严格等于用户输入的那个数——外币余额是逐行累加出来的，差出去的分会一直留在
  // 账上，期末调汇时被当成汇率变动算进汇兑损益。
  const foreignPerLine = isForeign
    ? allocateForeignAmounts(
        draft.lines.map((line) => ({
          debitCents: toCents(line.debit),
          creditCents: toCents(line.credit)
        })),
        foreignTotalCents,
        exchangeRate
      )
    : [];

  const now = new Date().toISOString();
  const mappingId = `tpl-draft-${Date.now()}`;
  const voucherId = `tpl-voucher-${Date.now()}`;
  const voucher: Voucher = {
    id: voucherId,
    companyId: req.auth!.companyId,
    businessEventId: draft.businessEventId,
    mappingId,
    voucherType: draft.voucherType,
    summary: draft.summary,
    status: "draft",
    // 会计日期取业务发生日，不是「今天」——这笔账属于业务发生的那个期间。
    accountingDate: toDateOnly(event.occurred_on) ?? now.slice(0, 10),
    voucherNumber: null,
    lines: draft.lines.map((line, index) => ({
      ...line,
      id: `${voucherId}-line-${index + 1}`,
      // 原币在这里就贴上，而不是等到写库时再算一遍：响应对象与落库内容必须同源，
      // 否则前端拿到的凭证和库里的对不上，而这种不一致要等到下次读取才暴露。
      currency: isForeign ? currency : BASE_CURRENCY,
      originalAmount: isForeign ? (foreignPerLine[index]! / 100).toFixed(2) : null,
      exchangeRate: isForeign ? exchangeRate : null
    })),
    approvedAt: null,
    postedAt: null,
    source: "analysis",
    createdAt: now,
    updatedAt: now
  };

  // 科目闸门：分录只能挂在这家公司真实存在的叶子科目上。此前三个写入函数
  // 一次都没校验过科目码，任何客户端调 POST /api/vouchers 都能写进任意字符串
  // 并过账 —— 迁移 041/042 就是这个洞造成的两次线上错账的事后补救。
  const templateAccounts = await checkAccountsUsable(req.auth!.companyId, voucher.lines);
  if (!templateAccounts.ok) {
    return json(res, 400, { error: templateAccounts.message, code: templateAccounts.code });
  }

  // 往来维度只贴到往来科目的行上（V12-C2）。给每一行都贴会让"银行存款-甲客户"
  // 这种无意义的组合进总账；判据用 account_type 而非科目码，D3 换编码时不用改这里。
  // 请求体上的往来单位优先于事项继承：事项建的时候可能还不知道对方是谁，
  // 记账时才补得上，而这时候再回头改事项既绕又容易忘。
  await attachCounterparty(
    req.auth!.companyId,
    voucher.lines,
    (typeof body.counterpartyId === "string" && body.counterpartyId ? body.counterpartyId : null) ??
      event.counterparty_id
  );
  // 成本中心由用户在创建时指定（V12-D1）。与往来单位不同，它不能从业务事项推断：
  // D1 刻意没有复用 departments 表——组织架构会变而核算口径要稳定，两者是两个概念。
  await attachCostCenter(
    req.auth!.companyId,
    voucher.lines,
    typeof body.costCenterId === "string" && body.costCenterId ? body.costCenterId : null
  );

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into event_voucher_drafts (
          id,
          company_id,
          business_event_id,
          voucher_type,
          status,
          summary,
          created_at
        ) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      `,
      [
        mappingId,
        voucher.companyId,
        voucher.businessEventId,
        voucher.voucherType,
        "draft",
        voucher.summary,
        now
      ]
    );

    for (const [index, line] of voucher.lines.entries()) {
      await client.query(
        `
          insert into voucher_draft_lines (
            id,
            draft_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order,
            currency,
            original_amount,
            exchange_rate
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10::numeric, $11)
        `,
        [
          `${mappingId}-line-${index + 1}`,
          mappingId,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index,
          line.currency ?? BASE_CURRENCY,
          line.originalAmount ?? null,
          line.exchangeRate ?? null
        ]
      );
    }

    await client.query(
      `
        insert into vouchers (
          id,
          company_id,
          business_event_id,
          mapping_id,
          voucher_type,
          summary,
          status,
          source,
          approved_at,
          posted_at,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      `,
      [
        voucher.id,
        voucher.companyId,
        voucher.businessEventId,
        voucher.mappingId,
        voucher.voucherType,
        voucher.summary,
        voucher.status,
        voucher.source,
        voucher.approvedAt,
        voucher.postedAt,
        voucher.createdAt,
        voucher.updatedAt
      ]
    );

    for (const [index, line] of voucher.lines.entries()) {
      await client.query(
        `
          insert into voucher_lines (
            id,
            voucher_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order,
            counterparty_id,
            cost_center_id,
            currency,
            original_amount,
            exchange_rate
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10, $11, $12::numeric, $13)
        `,
        [
          line.id,
          voucher.id,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index,
          line.counterpartyId ?? null,
          line.costCenterId ?? null,
          line.currency ?? BASE_CURRENCY,
          line.originalAmount ?? null,
          line.exchangeRate ?? null
        ]
      );
    }
  });

  return json(res, 201, voucher);
}

/**
 * 红冲：为已过账凭证生成一张借贷相反的冲销凭证。
 *
 * 这是已过账凭证唯一合法的更正出口。此前 `POST /api/events/:id/analyze` 会连同
 * 已过账凭证与其总账分录一起硬删（无留痕），该路径已被闸门堵成 409；但堵死之后
 * 系统没有任何更正入口，已过账事项就此进入死路 —— 本接口就是那个出口。
 *
 * 红冲凭证以 `draft` 落库，与普通凭证走完全相同的审核 → 过账流程：它同样是一笔
 * 真实账务，没有理由绕开职责分离。**刻意不自动过账**。
 */
