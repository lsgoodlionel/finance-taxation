/**
 * V7 J3 财税术语字典：为双轨模式提供统一的术语释义来源。
 * - term：专业原词（pro 模式展示）
 * - plain：白话短语（guided 模式展示，面向完全不懂财务的老板）
 * - brief：一句话解释（两种模式的悬停提示）
 * - detail：可选的详细说明（guided 模式悬停时追加展示）
 */

export interface TermEntry {
  key: string;
  term: string;
  plain: string;
  brief: string;
  detail?: string;
}

export const TERMINOLOGY: readonly TermEntry[] = [
  {
    key: "posting",
    term: "过账",
    plain: "记入正式账本",
    brief: "把审核通过的凭证正式记入公司账本，记入后会影响总账和报表",
    detail: "过账前的凭证只是草稿，可以随时修改；过账后就成为正式账务记录，再要改动必须走冲销或反结账流程。"
  },
  {
    key: "journal-entry",
    term: "分录",
    plain: "一笔账的借贷明细",
    brief: "记账的最小单位：每笔业务按“钱从哪里来、到哪里去”拆成借方和贷方两侧",
    detail: "例如支付房租 1 万元，会形成“借：管理费用 1 万 / 贷：银行存款 1 万”两行分录。"
  },
  {
    key: "voucher",
    term: "凭证",
    plain: "记账单据",
    brief: "记录一笔业务该怎么入账的正式单据，由分录组成，是账本和报表的直接来源"
  },
  {
    key: "debit",
    term: "借方",
    plain: "钱的去向",
    brief: "分录的左侧，一般表示资产增加或费用发生（钱花到了哪里）"
  },
  {
    key: "credit",
    term: "贷方",
    plain: "钱的来源",
    brief: "分录的右侧，一般表示资产减少或收入、负债增加（钱从哪里来）"
  },
  {
    key: "debit-credit-balance",
    term: "借贷平衡",
    plain: "两边金额相等",
    brief: "每张凭证借方合计必须等于贷方合计，不相等就说明账记错了"
  },
  {
    key: "accrual",
    term: "计提",
    plain: "预先记一笔",
    brief: "费用还没实际付钱，但按规则先记到当期账上，比如月底先记本月工资",
    detail: "计提保证费用记在真正发生的月份，而不是付款的月份，让每个月的利润更真实。"
  },
  {
    key: "depreciation",
    term: "折旧",
    plain: "设备价值分摊",
    brief: "把设备、房产等大件资产的成本分摊到使用的每个月，每月记一点费用"
  },
  {
    key: "amortization",
    term: "摊销",
    plain: "无形支出分摊",
    brief: "把软件、专利、长期费用等一次性支出分摊到受益的各个月份"
  },
  {
    key: "close-income",
    term: "结转损益",
    plain: "月底算利润",
    brief: "月底把当月所有收入和费用汇总轧差，算出本月利润并转入未分配利润",
    detail: "结转后当月损益科目清零，下月重新累计；这是每月结账的核心步骤之一。"
  },
  {
    key: "accrual-basis",
    term: "权责发生制",
    plain: "按业务发生时间记账",
    brief: "按业务实际发生的时间记账，而不是按收付款时间，比如 12 月的销售记在 12 月",
    detail: "与之相对的是收付实现制（收到钱才记收入）。正规企业记账和报税普遍采用权责发生制。"
  },
  {
    key: "reconciliation",
    term: "勾稽",
    plain: "交叉核对",
    brief: "把不同来源的数据互相核对，检查单据、凭证、报表、申报之间是否一致"
  },
  {
    key: "working-paper",
    term: "底稿",
    plain: "计算过程留底",
    brief: "记录数字怎么算出来的过程文件，供复核、审计和税务检查时追溯依据"
  },
  {
    key: "period-lock",
    term: "锁账",
    plain: "冻结已结账月份",
    brief: "把已经结账的月份锁定，防止旧账被继续修改或补记，保证报表数字稳定"
  },
  {
    key: "reopen-period",
    term: "反结账",
    plain: "解锁旧账期",
    brief: "把已锁定的月份重新打开以便更正错账，属于例外操作，全程会留下审计记录"
  },
  {
    key: "output-vat",
    term: "销项税额",
    plain: "卖货收的税",
    brief: "公司销售商品或服务时，向客户收取的增值税"
  },
  {
    key: "input-vat",
    term: "进项税额",
    plain: "买货付的税",
    brief: "公司采购时支付给供应商的增值税，取得合规发票后可以抵扣销项税"
  },
  {
    key: "vat",
    term: "增值税",
    plain: "买卖差价的税",
    brief: "对商品和服务流转征收的税，通常按销项税减进项税的差额缴纳"
  },
  {
    key: "surtax",
    term: "附加税",
    plain: "跟着增值税交的小税",
    brief: "以实际缴纳的增值税为基数附加征收的城建税、教育费附加等小税种"
  },
  {
    key: "stamp-duty",
    term: "印花税",
    plain: "签合同交的税",
    brief: "对合同、产权转移书据等应税凭证按金额比例征收的小额税种"
  },
  {
    key: "cit",
    term: "企业所得税",
    plain: "按利润交的税",
    brief: "对公司年度利润征收的税，一般按季度预缴、年度汇算清缴"
  },
  {
    key: "iit",
    term: "个税（IIT）",
    plain: "员工工资的税",
    brief: "从员工工资中代扣代缴的个人所得税，公司是扣缴义务人"
  },
  {
    key: "super-deduction",
    term: "加计扣除",
    plain: "研发费多抵税",
    brief: "符合条件的研发费用可以按超过实际金额的比例税前扣除，从而少交企业所得税"
  },
  {
    key: "rnd-collection",
    term: "研发费用归集",
    plain: "整理研发花了多少钱",
    brief: "把人员、材料、设备等研发相关支出按项目分类汇总，作为加计扣除的依据"
  },
  {
    key: "three-statements",
    term: "三大报表",
    plain: "三张核心财务报表",
    brief: "资产负债表、利润表、现金流量表的合称，分别回答家底、赚亏、现金三个问题"
  },
  {
    key: "balance-sheet",
    term: "资产负债表",
    plain: "公司家底表",
    brief: "某一天公司有多少资产、欠多少债、净资产多少的快照，回答“公司值多少”"
  },
  {
    key: "income-statement",
    term: "利润表",
    plain: "赚亏表",
    brief: "一段时间内公司收入多少、花了多少、赚了还是亏了，回答“经营得怎么样”"
  },
  {
    key: "cash-flow-statement",
    term: "现金流量表",
    plain: "现金进出表",
    brief: "一段时间内现金实际流入流出情况，回答“账上现金为什么变多或变少”"
  },
  {
    key: "account",
    term: "科目",
    plain: "账目分类",
    brief: "给每笔账分类的标准名目，如“银行存款”“管理费用”，全公司统一使用"
  },
  {
    key: "opening-balance",
    term: "期初余额",
    plain: "月初的起点数",
    brief: "一个会计期间开始时各科目结转过来的余额，是本期记账的起点"
  },
  {
    key: "trial-balance",
    term: "试算平衡",
    plain: "全账总核对",
    brief: "把所有科目的借方和贷方分别加总，检查两边是否相等，用于发现记账错误"
  },
  {
    key: "archive",
    term: "归档",
    plain: "资料存档备查",
    brief: "把单据、凭证、报表等资料整理封存，形成可追溯、可检查的完整档案"
  },
  {
    key: "audit-trail",
    term: "审计留痕",
    plain: "操作全程记录",
    brief: "系统自动记录谁在什么时候做了什么操作，供审计和追责时查证"
  },
  {
    key: "invoice-tax-consistency",
    term: "票税一致性",
    plain: "发票和报税对得上",
    brief: "核对发票、账面记录与纳税申报三者的口径是否一致，避免税务风险"
  },
  {
    key: "filing-batch",
    term: "申报批次",
    plain: "一次报税任务包",
    brief: "把同一期间、同一税种要申报的事项打包成一个批次，统一校验、复核和提交"
  },
  {
    key: "taxpayer-profile",
    term: "纳税人档案",
    plain: "公司报税身份信息",
    brief: "公司的纳税人类型、适用税率、申报周期等基础信息，决定各税种怎么算怎么报"
  },
  {
    key: "general-ledger",
    term: "总账",
    plain: "公司总账本",
    brief: "汇总全部已过账凭证的正式账本，按科目归集，是编制报表的直接依据"
  },
  {
    key: "period-snapshot",
    term: "期末快照",
    plain: "月底报表存底",
    brief: "结账时对当期财务报表数据拍一张“快照”留存，供日后对比和追溯"
  }
] as const;

const TERM_INDEX: ReadonlyMap<string, TermEntry> = new Map(
  TERMINOLOGY.map((entry) => [entry.key, entry])
);

/** 按 key 查询词条；未命中返回 null。 */
export function getTermEntry(key: string): TermEntry | null {
  return TERM_INDEX.get(key) ?? null;
}
