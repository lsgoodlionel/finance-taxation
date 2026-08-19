/**
 * 银企直连的配置与付款指令（V14-A）。
 *
 * ## 与已有 `banking/bank-api.ts` 的分界
 *
 * 项目里**已经有**一套银行 API 连接器，做的是「拉流水」与「代发工资」。
 * 这个模块做的是**对公付款指令**——把 V13-C 的付款单提交给银行。两件事
 * 分开的理由：
 *
 * | | `banking/bank-api.ts` | 这里 |
 * |---|---|---|
 * | 方向 | 主要是收（拉流水） | 付 |
 * | 认证 | apiKey/apiSecret | **证书 + 签名（RSA/SM2）** |
 * | 幂等 | 无 | `clientRef` 必需 |
 * | 状态 | 一次性返回 | 异步回执 + 轮询回写 |
 *
 * 幂等和状态回写是对公付款独有的要求：拉流水拉两次没关系，付款付两次是事故。
 *
 * ## 为什么不复用 `integration_configs`
 *
 * 那张表是「一家公司 × 一种配置 = 一条」。而一家公司可能有多个对公账户，
 * 每个户各自签约、各自一套证书 —— 一对多，塞不进去。
 *
 * ## 不自动改付款单状态
 *
 * 银行说「已受理」不等于钱到账了，说「成功」在 mock 环境下更是假的。
 * 指令的状态记在自己表上，付款单仍由出纳确认后标记已付。
 * 把两者串成自动流程，等于让一个未验证的适配器直接改账。
 */

import { query, queryOne, withTransaction } from "../../db/client.js";
import { uniqueId } from "../../utils/id.js";
import { resolvePayee } from "../payments/payee.js";
import {
  getBankAdapter,
  type BankCredential,
  type BankTransferStatus
} from "./adapter.js";

export type BankConnectFailureCode =
  | "BANK_CONFIG_NOT_FOUND"
  | "BANK_CONFIG_DISABLED"
  | "BANK_PROVIDER_NOT_IMPLEMENTED"
  | "BANK_PAYMENT_NOT_FOUND"
  | "BANK_PAYMENT_NOT_SUBMITTED"
  | "BANK_PAYEE_INCOMPLETE"
  | "BANK_INSTRUCTION_NOT_FOUND";

export type BankConnectResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: BankConnectFailureCode; message: string } };

function fail<T>(code: BankConnectFailureCode, message: string): BankConnectResult<T> {
  return { ok: false, failure: { code, message } };
}

// ── 配置 ──────────────────────────────────────────────────────────────────────

export interface BankConnectConfig {
  id: string;
  provider: string;
  displayName: string;
  payerAccount: string;
  customerNo: string;
  endpoint: string;
  signAlgorithm: "RSA" | "SM2";
  certRef: string;
  /** 证书密码**永不回显**，只告诉前台设没设过。 */
  hasCertPassword: boolean;
  certFingerprint: string | null;
  certExpiresOn: string | null;
  enabled: boolean;
  /** 该 provider 是否已有适配器实现。前台据此提示「尚未接入」。 */
  isProviderAvailable: boolean;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
  lastTestMsg: string | null;
  note: string | null;
}

interface ConfigDbRow {
  id: string;
  provider: string;
  display_name: string;
  payer_account: string;
  customer_no: string;
  endpoint: string;
  sign_algorithm: "RSA" | "SM2";
  cert_ref: string;
  cert_password_enc: string | null;
  cert_fingerprint: string | null;
  cert_expires_on: string | Date | null;
  enabled: boolean;
  last_test_ok: boolean | null;
  last_test_at: string | Date | null;
  last_test_msg: string | null;
  note: string | null;
}

function toIsoDate(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapConfig(row: ConfigDbRow): BankConnectConfig {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.display_name,
    payerAccount: row.payer_account,
    customerNo: row.customer_no,
    endpoint: row.endpoint,
    signAlgorithm: row.sign_algorithm,
    certRef: row.cert_ref,
    hasCertPassword: row.cert_password_enc !== null && row.cert_password_enc !== "",
    certFingerprint: row.cert_fingerprint,
    certExpiresOn: toIsoDate(row.cert_expires_on),
    enabled: row.enabled,
    isProviderAvailable: getBankAdapter(row.provider) !== null,
    lastTestOk: row.last_test_ok,
    lastTestAt: toIso(row.last_test_at),
    lastTestMsg: row.last_test_msg,
    note: row.note
  };
}

const CONFIG_COLUMNS = `id, provider, display_name, payer_account, customer_no, endpoint,
  sign_algorithm, cert_ref, cert_password_enc, cert_fingerprint, cert_expires_on,
  enabled, last_test_ok, last_test_at, last_test_msg, note`;

export async function listBankConnectConfigs(companyId: string): Promise<BankConnectConfig[]> {
  const rows = await query<ConfigDbRow>(
    `select ${CONFIG_COLUMNS} from bank_connect_configs
      where company_id = $1 order by created_at`,
    [companyId]
  );
  return rows.map(mapConfig);
}

export interface UpsertConfigInput {
  companyId: string;
  id: string | null;
  provider: string;
  displayName: string;
  payerAccount: string;
  customerNo: string;
  endpoint: string;
  signAlgorithm: "RSA" | "SM2";
  certRef: string;
  /** `null` 表示不改（保留原值）；空串表示清除。**与 0/null 语义同理**。 */
  certPassword: string | null;
  certFingerprint: string | null;
  certExpiresOn: string | null;
  enabled: boolean;
  note: string | null;
}

export async function upsertBankConnectConfig(
  input: UpsertConfigInput
): Promise<BankConnectResult<BankConnectConfig>> {
  const id = input.id ?? uniqueId("bkc");

  const row = await queryOne<ConfigDbRow>(
    `insert into bank_connect_configs
       (id, company_id, provider, display_name, payer_account, customer_no, endpoint,
        sign_algorithm, cert_ref, cert_password_enc, cert_fingerprint, cert_expires_on,
        enabled, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (company_id, payer_account) do update set
       provider = excluded.provider,
       display_name = excluded.display_name,
       customer_no = excluded.customer_no,
       endpoint = excluded.endpoint,
       sign_algorithm = excluded.sign_algorithm,
       cert_ref = excluded.cert_ref,
       -- 密码传 null 表示不改：编辑页不回显密码，保存时若原样提交
       -- 会把密码清成空。coalesce 让「没填」等于「保持原样」。
       cert_password_enc = coalesce(excluded.cert_password_enc, bank_connect_configs.cert_password_enc),
       cert_fingerprint = excluded.cert_fingerprint,
       cert_expires_on = excluded.cert_expires_on,
       enabled = excluded.enabled,
       note = excluded.note,
       updated_at = now()
     returning ${CONFIG_COLUMNS}`,
    [
      id,
      input.companyId,
      input.provider.trim(),
      input.displayName.trim(),
      input.payerAccount.trim(),
      input.customerNo.trim(),
      input.endpoint.trim(),
      input.signAlgorithm,
      input.certRef.trim(),
      input.certPassword,
      input.certFingerprint,
      input.certExpiresOn,
      input.enabled,
      input.note
    ]
  );

  return { ok: true, value: mapConfig(row!) };
}

export async function deleteBankConnectConfig(
  companyId: string,
  id: string
): Promise<BankConnectResult<{ id: string }>> {
  // 有指令引用时数据库的 on delete restrict 会拦下——那是对的：
  // 删掉配置会让已提交的指令查不出是从哪个户发出去的。
  const row = await queryOne<{ id: string }>(
    "delete from bank_connect_configs where company_id=$1 and id=$2 returning id",
    [companyId, id]
  );
  if (!row) return fail("BANK_CONFIG_NOT_FOUND", "银企配置不存在");
  return { ok: true, value: row };
}

function toCredential(row: ConfigDbRow): BankCredential {
  return {
    certRef: row.cert_ref,
    signAlgorithm: row.sign_algorithm,
    customerNo: row.customer_no,
    endpoint: row.endpoint
  };
}

/** 连通性测试。**不发起任何资金操作**，只验凭据。 */
export async function testBankConnectConfig(
  companyId: string,
  id: string
): Promise<BankConnectResult<{ ok: boolean; message: string }>> {
  const row = await queryOne<ConfigDbRow>(
    `select ${CONFIG_COLUMNS} from bank_connect_configs where company_id=$1 and id=$2`,
    [companyId, id]
  );
  if (!row) return fail("BANK_CONFIG_NOT_FOUND", "银企配置不存在");

  const adapter = getBankAdapter(row.provider);
  if (!adapter) {
    // 配了一家还没实现的银行是正常状态。回写这个结果而不是抛错，
    // 让配置页上直接看到「尚未接入」而不是一个红色的未知错误。
    const message = `「${row.provider}」尚未接入，只能保存配置`;
    await recordTestResult(companyId, id, false, message);
    return fail("BANK_PROVIDER_NOT_IMPLEMENTED", message);
  }

  const result = await adapter.testConnection(toCredential(row));
  await recordTestResult(companyId, id, result.ok, result.message);
  return { ok: true, value: result };
}

async function recordTestResult(
  companyId: string,
  id: string,
  ok: boolean,
  message: string
): Promise<void> {
  await query(
    `update bank_connect_configs
        set last_test_ok=$3, last_test_at=now(), last_test_msg=$4, updated_at=now()
      where company_id=$1 and id=$2`,
    [companyId, id, ok, message]
  );
}

// ── 付款指令 ──────────────────────────────────────────────────────────────────

export interface TransferInstruction {
  id: string;
  paymentId: string;
  paymentNo: string;
  configId: string;
  configName: string;
  clientRef: string;
  bankRef: string | null;
  amountCents: number;
  payeeAccount: string;
  payeeName: string;
  status: BankTransferStatus | "pending";
  message: string | null;
  submittedAt: string | null;
  lastCheckedAt: string | null;
}

interface InstructionDbRow {
  id: string;
  payment_id: string;
  payment_no: string;
  config_id: string;
  config_name: string;
  client_ref: string;
  bank_ref: string | null;
  amount_cents: string | number;
  payee_account: string;
  payee_name: string;
  status: TransferInstruction["status"];
  message: string | null;
  submitted_at: string | Date | null;
  last_checked_at: string | Date | null;
}

function mapInstruction(row: InstructionDbRow): TransferInstruction {
  return {
    id: row.id,
    paymentId: row.payment_id,
    paymentNo: row.payment_no,
    configId: row.config_id,
    configName: row.config_name,
    clientRef: row.client_ref,
    bankRef: row.bank_ref,
    amountCents: Number(row.amount_cents),
    payeeAccount: row.payee_account,
    payeeName: row.payee_name,
    status: row.status,
    message: row.message,
    submittedAt: toIso(row.submitted_at),
    lastCheckedAt: toIso(row.last_checked_at)
  };
}

const INSTRUCTION_SELECT = `
  select i.id, i.payment_id, p.payment_no, i.config_id, c.display_name as config_name,
         i.client_ref, i.bank_ref, i.amount_cents, i.payee_account, i.payee_name,
         i.status, i.message, i.submitted_at, i.last_checked_at
    from bank_transfer_instructions i
    join payments p on p.id = i.payment_id
    join bank_connect_configs c on c.id = i.config_id
   where i.company_id = $1`;

/**
 * 读一条指令的完整视图。
 *
 * **不能写成 `with updated as (update ...) select ...`**：Postgres 里 CTE 的
 * 数据修改与主查询看的是同一个快照，主查询会读到更新**前**的行。写成那样
 * 编译通过、跑起来永远返回旧状态——一个只在集成测试里才暴露的错。
 */
async function readInstruction(
  companyId: string,
  instructionId: string
): Promise<TransferInstruction | null> {
  const row = await queryOne<InstructionDbRow>(`${INSTRUCTION_SELECT} and i.id = $2`, [
    companyId,
    instructionId
  ]);
  return row ? mapInstruction(row) : null;
}

export async function listInstructions(
  companyId: string,
  filters: { paymentId?: string } = {}
): Promise<TransferInstruction[]> {
  const clauses: string[] = [];
  const params: unknown[] = [companyId];
  if (filters.paymentId) {
    params.push(filters.paymentId);
    clauses.push(`and i.payment_id = $${params.length}`);
  }
  const rows = await query<InstructionDbRow>(
    `${INSTRUCTION_SELECT} ${clauses.join(" ")} order by i.created_at desc`,
    params
  );
  return rows.map(mapInstruction);
}

export interface SubmitInstructionInput {
  companyId: string;
  paymentId: string;
  configId: string;
  userId: string;
}

/**
 * 把一张付款单提交给银行。
 *
 * 顺序是**先落库再调银行**：库里先有一条 pending，即便调用过程中进程挂了，
 * 也留下「这笔提交过」的痕迹。反过来先调后落，一次超时就会变成
 * 「银行那边可能付了而我们完全没有记录」——那是对账里最坏的一种状态。
 */
export async function submitInstruction(
  input: SubmitInstructionInput
): Promise<BankConnectResult<TransferInstruction>> {
  const config = await queryOne<ConfigDbRow>(
    `select ${CONFIG_COLUMNS} from bank_connect_configs where company_id=$1 and id=$2`,
    [input.companyId, input.configId]
  );
  if (!config) return fail("BANK_CONFIG_NOT_FOUND", "银企配置不存在");
  if (!config.enabled) return fail("BANK_CONFIG_DISABLED", "该银企配置未启用");

  const adapter = getBankAdapter(config.provider);
  if (!adapter) {
    return fail("BANK_PROVIDER_NOT_IMPLEMENTED", `「${config.provider}」尚未接入，无法提交指令`);
  }

  const payment = await queryOne<{
    id: string;
    payment_no: string;
    amount_cents: string | number;
    status: string;
    note: string | null;
  }>(
    "select id, payment_no, amount_cents, status, note from payments where company_id=$1 and id=$2",
    [input.companyId, input.paymentId]
  );
  if (!payment) return fail("BANK_PAYMENT_NOT_FOUND", "付款单不存在");

  // 草稿不能提交给银行——草稿的意思就是「还没定」。已作废的更不能。
  if (payment.status !== "submitted") {
    return fail(
      "BANK_PAYMENT_NOT_SUBMITTED",
      `付款单当前为「${payment.status}」，只有已提交的付款单能发往银行`
    );
  }

  const payee = await resolvePayee(input.companyId, input.paymentId);
  if (payee.payeeAccount === "" || payee.payeeName === "") {
    // CSV 导出可以留空让出纳补，直连不行：报文发出去就退回来了。
    return fail("BANK_PAYEE_INCOMPLETE", "收款人账号或户名为空，请先在往来单位档案补齐");
  }

  const instructionId = uniqueId("bti");
  // 流水号带付款单号：银行侧对账时能直接看出是哪一笔。
  const clientRef = `${payment.payment_no}-${instructionId.slice(-8)}`;
  const amountCents = Number(payment.amount_cents);

  await query(
    `insert into bank_transfer_instructions
       (id, company_id, payment_id, config_id, client_ref, amount_cents,
        payee_account, payee_name, status, created_by_user_id, submitted_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9, now())`,
    [
      instructionId,
      input.companyId,
      input.paymentId,
      input.configId,
      clientRef,
      amountCents,
      payee.payeeAccount,
      payee.payeeName
    ].concat([input.userId]) as unknown[]
  );

  const result = await adapter.transfer(toCredential(config), {
    payerAccount: config.payer_account,
    payeeAccount: payee.payeeAccount,
    payeeName: payee.payeeName,
    payeeBankName: payee.payeeBank || null,
    amountCents,
    purpose: payment.note ?? payment.payment_no,
    clientRef
  });

  await query(
    `update bank_transfer_instructions
        set status=$3, bank_ref=$4, message=$5, last_checked_at=now(), updated_at=now()
      where company_id=$1 and id=$2`,
    [input.companyId, instructionId, result.status, result.bankRef, result.message]
  );

  const row = await readInstruction(input.companyId, instructionId);
  return { ok: true, value: row! };
}

/**
 * 向银行查一条指令的最新状态并回写。
 *
 * 终态（succeeded/failed）不再查——银行不会把已完成的改回去，
 * 而反复查一笔已完成的付款只是在浪费对方的限额。
 */
export async function refreshInstructionStatus(
  companyId: string,
  instructionId: string
): Promise<BankConnectResult<TransferInstruction>> {
  const current = await queryOne<{
    client_ref: string;
    status: TransferInstruction["status"];
    config_id: string;
  }>(
    "select client_ref, status, config_id from bank_transfer_instructions where company_id=$1 and id=$2",
    [companyId, instructionId]
  );
  if (!current) return fail("BANK_INSTRUCTION_NOT_FOUND", "付款指令不存在");

  if (current.status === "succeeded" || current.status === "failed") {
    return { ok: true, value: (await readInstruction(companyId, instructionId))! };
  }

  const config = await queryOne<ConfigDbRow>(
    `select ${CONFIG_COLUMNS} from bank_connect_configs where company_id=$1 and id=$2`,
    [companyId, current.config_id]
  );
  if (!config) return fail("BANK_CONFIG_NOT_FOUND", "银企配置不存在");

  const adapter = getBankAdapter(config.provider);
  if (!adapter) {
    return fail("BANK_PROVIDER_NOT_IMPLEMENTED", `「${config.provider}」尚未接入`);
  }

  const result = await adapter.queryStatus(toCredential(config), current.client_ref);

  await query(
    `update bank_transfer_instructions
        set status=$3, bank_ref=coalesce($4, bank_ref), message=$5,
            last_checked_at=now(), updated_at=now()
      where company_id=$1 and id=$2`,
    [companyId, instructionId, result.status, result.bankRef, result.message]
  );

  const row = await readInstruction(companyId, instructionId);
  return { ok: true, value: row! };
}

/** 查某个配置对应账号的余额。查不到适配器时明确报错，不返回一个假的 0。 */
export async function queryConfigBalance(
  companyId: string,
  configId: string
): Promise<BankConnectResult<{ availableCents: number; currency: string; asOf: string }>> {
  const config = await queryOne<ConfigDbRow>(
    `select ${CONFIG_COLUMNS} from bank_connect_configs where company_id=$1 and id=$2`,
    [companyId, configId]
  );
  if (!config) return fail("BANK_CONFIG_NOT_FOUND", "银企配置不存在");

  const adapter = getBankAdapter(config.provider);
  if (!adapter) {
    return fail("BANK_PROVIDER_NOT_IMPLEMENTED", `「${config.provider}」尚未接入`);
  }

  const result = await adapter.queryBalance(toCredential(config), config.payer_account);
  // 时间戳在这里打而不是让适配器返回：余额是一个快照，「什么时候查的」
  // 是我方的事实，不该由被查方决定。
  return {
    ok: true,
    value: {
      availableCents: result.availableCents,
      currency: result.currency,
      asOf: new Date().toISOString()
    }
  };
}

export { withTransaction };
