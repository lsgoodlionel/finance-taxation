/**
 * 业务入口组与经营管理组的页面指南（V15）。
 *
 * 这两组面向**非财务人员**居多，措辞要避开记账口径的黑话——
 * 他们要的是「我出差花了 800 住宿费」，不是「借：管理费用-差旅费」。
 */

import type { PageGuide } from "./types";

export const ENTRY_GUIDES: readonly PageGuide[] = [
  {
    route: "/home",
    title: "今天",
    audience: "所有人，尤其是不看账的管理者",
    permission: "tasks.view",
    purpose: "用白话说清公司现在的状况：赚没赚钱、钱够不够、有什么要你处理。",
    steps: [
      "看顶部三张卡：本期利润、可用资金、待办件数",
      "看「要你处理的事」——那是系统判断需要你决定的，不是全部待办",
      "点任一条直接进入对应页面处理"
    ],
    caution: ["数字只统计**已过账**的凭证，月中看到的会偏低——月末结完账才是完整的"],
    flow: "汇总自各业务模块，这一页不录任何东西",
    related: ["/inbox", "/dashboard/chairman", "/approvals"]
  },
  {
    route: "/quick-entry",
    title: "记一笔",
    audience: "会计",
    permission: "tasks.view",
    purpose: "把一笔日常支出快速记成分录，不用先建事项再走凭证。",
    prerequisites: ["会计科目表已初始化（新公司自动建好）"],
    steps: [
      "选支出类型（房租、水电、差旅……）",
      "填金额与日期，有发票就传",
      "确认系统给出的科目，不对可以改",
      "提交后生成凭证草稿，到凭证中心复核过账"
    ],
    fields: [
      {
        name: "日期",
        meaning: "这笔账算在哪一天。",
        note: "**决定它属于哪个会计期间**。补录上月的账，日期要填上月。"
      },
      { name: "科目", meaning: "这笔钱记在哪个费用类别下。", note: "按支出类型自动带出，改之前先确认真的不对。" }
    ],
    caution: [
      "生成的是**草稿**，不复核过账就不进总账、报表上看不到",
      "没有发票也能记，但税前扣除时会被剔除——记得后补"
    ],
    flow: "记一笔 → 凭证草稿 → 复核过账 → 总账 → 报表",
    related: ["/vouchers", "/bills", "/events"]
  },
  {
    route: "/inbox",
    title: "我的一天",
    audience: "所有人",
    permission: "tasks.view",
    purpose: "把分散在各模块的待办收拢到一处，按该先做什么排序。",
    steps: [
      "从上往下处理——排在前面的是系统判断更急的",
      "每一条都能直接点进它所属的页面",
      "处理完这一条会自动从列表消失"
    ],
    flow: "汇总自审批、任务、单据、风险各模块，不是独立的数据",
    related: ["/approvals", "/tasks", "/risk"]
  },
  {
    route: "/assistant",
    title: "AI 财税助手",
    audience: "所有人",
    permission: "tasks.view",
    purpose: "用自然语言问账务与税务问题，助手会查你公司的真实数据回答。",
    prerequisites: ["系统中心 → AI 配置里已配好模型与密钥"],
    steps: ["直接提问，例如「上个月差旅费花了多少」", "答案里的数字可以点进去看明细"],
    caution: ["AI 的回答**不能作为申报依据**——它是查数与解释的工具，不是审核者"],
    flow: "只读你公司的数据，不会替你改任何东西",
    related: ["/settings", "/knowledge"]
  },
  {
    route: "/events",
    title: "经营事项总线",
    audience: "业务人员与会计",
    permission: "events.view / events.create",
    purpose: "把「公司发生了什么」记下来，由系统判断该怎么入账。",
    steps: [
      "新建事项：描述发生了什么、多少钱、有什么单据",
      "点「分析」让系统给出建议的入账方式",
      "确认后生成凭证草稿"
    ],
    fields: [
      { name: "事项描述", meaning: "用business的话说清发生了什么。", note: "写得越具体，系统给的科目建议越准。" },
      { name: "成本中心", meaning: "这件事算哪个部门的。", note: "会带到凭证行上，决定部门费用报表怎么归集。" }
    ],
    caution: ["**已过账的事项不能重新分析**——要改只能先红冲那张凭证"],
    pitfalls: [
      {
        symptom: "点「分析」报 409 拒绝",
        cause: "这个事项已经过账了，或者它所属的期间被锁了。",
        fix: "已过账的先红冲；期间锁了的先解锁或改在当前期间处理。"
      }
    ],
    flow:
      "本页是整个流程的**起点**：记录业务背景与 AI 分析结果 → 拆到任务中心推进执行 → " +
      "沉淀到单据中心、凭证中心与税务中心 → 由风险勾稽做横向检查与闭环跟踪",
    related: ["/vouchers", "/quick-entry", "/risk", "/tasks", "/tax"]
  },
  {
    route: "/dashboard/chairman",
    title: "董事长驾驶舱",
    audience: "管理层",
    permission: "dashboard.view",
    purpose: "一屏看清经营全貌：利润、现金、税负、风险。",
    steps: ["在页头选要看哪个会计期间", "看四张主卡与趋势图", "异常项会标红，点进去看明细"],
    caution: ["数字只统计**已过账**的凭证——草稿不算，所以月中看到的会偏低"],
    flow: "已过账凭证 → 汇总 → 本页",
    related: ["/reports", "/risk", "/home"]
  },
  {
    route: "/tasks",
    title: "任务中心",
    audience: "所有人",
    permission: "tasks.view",
    purpose: "看和管派给自己或自己派出去的任务。",
    steps: [
      "按状态筛选，或切到看板视图",
      "看板里把卡片拖到目标列，或在列表里点「开始执行」推进状态",
      "缺资料就去单据中心补齐，补齐后回来继续推进"
    ],
    flow:
      "系统按经营事项拆出任务并分派到责任部门 → 本页推进执行 → 缺资料回单据中心补 → " +
      "凭证中心最终入账。三者之中任务中心最靠前",
    related: ["/inbox", "/events", "/documents", "/vouchers"]
  },
  {
    route: "/contracts",
    title: "合同与往来",
    audience: "业务、财务",
    permission: "contracts.view / contracts.manage",
    purpose: "管合同台账、付款计划与验收，以及客户/供应商往来档案。",
    prerequisites: ["要走付款流程的话，往来单位档案里要填银行账号与户名"],
    steps: [
      "建合同：填对方、金额、签订日、合同类型",
      "拆付款计划：按期次填金额与到期日（质保金作为独立一期）",
      "货到或服务完成后录验收单并**确认**",
      "到期时在付款中心付款"
    ],
    fields: [
      {
        name: "往来单位 → 收款账号",
        meaning: "付款时打给哪个账户。",
        note: "**不填的话付款导出与银企直连都拿不到收款方**，导出的 CSV 里那几列是空的。"
      },
      {
        name: "往来单位 → 收款户名",
        meaning: "账户的开户名。",
        note: "**未必等于单位名称**——供应商可能用关联公司的账户收款，个人往来更常见（单位叫「张三工作室」而户名是「张三」）。等同处理会被银行以户名不符退回。"
      },
      {
        name: "验收单状态",
        meaning: "草稿 / 已确认 / 已作废。",
        note: "**只有「已确认」的验收单计入三单匹配**。草稿不算数。"
      }
    ],
    caution: [
      "已确认的验收单可以作废（退货、质量问题），但**不能退回草稿**——那会让「确认过」这个事实消失，而三单匹配已经按它算过了",
      "合同金额与付款计划合计不一致时系统不拦——分期付款、变更追加都是正常的"
    ],
    pitfalls: [
      {
        symptom: "付款时三单匹配提示「无验收记录」",
        cause: "验收单还是草稿，或者根本没录。",
        fix: "录验收单并点「确认」。这个提示不阻断付款——预付款本来就没有验收。"
      }
    ],
    flow: "合同 → 付款计划 → 验收 → 付款中心 → 凭证",
    related: ["/payments", "/asset-center", "/documents"]
  },
  {
    route: "/payroll",
    title: "工资管理",
    audience: "人事、财务",
    permission: "payroll.view / payroll.manage",
    purpose: "算工资、算个税与社保公积金、生成代发文件与计提凭证。",
    prerequisites: ["员工档案里有基本工资与社保基数", "系统中心里配好社保公积金比例"],
    steps: [
      "选期间，确认参与计算的员工（在职的自动带出）",
      "看计算预览：应发 → 各项扣除 → 实发",
      "需要时做人工调整（加班费、奖金、扣款）",
      "审核确认后生成代发文件与计提凭证"
    ],
    fields: [
      {
        name: "个人社保 / 个人公积金",
        meaning: "从员工工资里扣的部分。",
        note: "它们解释了「应发为什么不等于实发」。"
      },
      {
        name: "单位社保 / 单位公积金",
        meaning: "公司额外承担的部分，不从工资里扣。",
        note: "这是**公司用工成本**，不影响员工到手的钱。默认在表里折起来了。"
      }
    ],
    caution: ["确认之后再改要**先撤销整批**——单条改会让合计与个税对不上"],
    pitfalls: [
      {
        symptom: "某个员工没出现在计算列表里",
        cause: "档案里状态不是「在职」，或者入职日期晚于本期。",
        fix: "到员工档案检查状态与入职日期。"
      }
    ],
    flow: "员工档案 → 计算 → 确认 → 代发文件 + 计提凭证",
    related: ["/vouchers", "/tax", "/export-center"]
  }
];
