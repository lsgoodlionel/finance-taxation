/**
 * 研发风控组与系统组的页面指南（V15）。
 */

import type { PageGuide } from "./types";

export const RISK_SYS_GUIDES: readonly PageGuide[] = [
  {
    route: "/rnd",
    title: "研发辅助账",
    audience: "研发管理、财务",
    permission: "rnd.view / rnd.manage",
    purpose: "归集研发费用、算加计扣除、生成税局要的辅助账台账。",
    prerequisites: ["研发项目档案已建（项目编号、开始日期、资本化政策）"],
    steps: [
      "确认项目合规性——对照高新技术企业加计扣除的条件逐条勾",
      "按费用类别录入本期研发费用",
      "看加计扣除测算结果",
      "确认后生成台账，自动推送到税务中心的企业所得税申报材料"
    ],
    fields: [
      {
        name: "费用类别",
        meaning: "人员人工 / 直接投入 / 折旧摊销 / 设计试验 / 其他。",
        note: "**「其他费用」有比例上限**（不超过可加计总额的 10%），超出部分不能加计。"
      },
      {
        name: "费用化 / 资本化",
        meaning: "费用化直接进当期损益，资本化形成无形资产分期摊销。",
        note: "研究阶段必须费用化；开发阶段满足条件才能资本化。选错影响当期利润与后续摊销。"
      }
    ],
    caution: ["测算结果**以年度汇算清缴时税务机关核定的为准**，这里是台账口径"],
    flow: "研发费用 → 归集 → 加计测算 → 台账 → 企业所得税申报",
    related: ["/tax", "/vouchers", "/export-center"]
  },
  {
    route: "/risk",
    title: "风险勾稽",
    audience: "财务负责人、审计",
    permission: "risk.view / risk.manage",
    purpose: "自动找账上的异常与税会差异，逐条复核。",
    steps: [
      "看系统自动找出的发现列表",
      "逐条确认是真问题还是有正当解释",
      "处理完标记消解，下次扫描不再重复报"
    ],
    caution: ["消解不等于修正——它只是说明「这条已经看过、有解释」。真有问题还要去对应模块改"],
    flow: "各模块数据 → 规则扫描 → 发现 → 人工复核 → 消解",
    related: ["/vouchers", "/tax", "/audit"]
  },
  {
    route: "/audit",
    title: "审计日志",
    audience: "审计、管理层",
    permission: "audit.view",
    purpose: "查谁在什么时候改了什么。",
    steps: ["按操作人、按对象类型、按时间范围过滤", "点某一条进去看变更前后的值"],
    caution: ["日志**只增不改**——任何人都删不掉自己的记录，包括管理员"],
    flow: "所有写操作自动留痕 → 这里检索",
    related: ["/risk", "/documents"]
  },
  {
    route: "/knowledge",
    title: "制度库",
    audience: "所有人",
    permission: "knowledge.view",
    purpose: "查公司自己的财务制度与报销标准——不确定能不能报、报多少时来这里。",
    steps: ["按类别浏览，或用搜索框找具体的制度条款"],
    flow: "管理员维护 → 全员查阅",
    related: ["/reimbursements", "/settings"]
  },
  {
    route: "/settings",
    title: "系统中心",
    audience: "**管理员与财务负责人**",
    permission: "settings.manage",
    purpose: "配置公司信息、AI、外部对接、银企直连、开放 API，以及看完整操作说明书。",
    prerequisites: ["需要 settings.manage 权限——只有董事长与财务负责人有"],
    steps: [
      "「公司信息」填工商与税务基本信息（**纳税人身份决定增值税怎么算**）",
      "「AI 配置」选模型与填密钥",
      "「外部对接」配发票服务商与通知渠道",
      "「银企直连」配对公付款账号与证书",
      "「关于系统」看完整说明书，可在线预览与存为 PDF"
    ],
    fields: [
      {
        name: "纳税人身份",
        meaning: "一般纳税人还是小规模纳税人。",
        note: "**决定增值税怎么算**。填错会让增值税结转返回「不适用」或算错税额。"
      },
      {
        name: "银企直连 → 证书路径",
        meaning: "网银证书文件的路径或密钥库别名。",
        note: "**不要粘贴证书内容**——证书内容不存进系统。存内容意味着数据库备份里有私钥，泄漏后无法追溯从哪份备份流出。"
      },
      {
        name: "银企直连 → 证书密码",
        meaning: "打开证书用的密码。",
        note: "**保存后永不回显**。编辑时留空表示保持原密码不变，不是清空。"
      }
    ],
    caution: [
      "**银企直连的证书配置等于付款能力**——这也是这一页只对管理员与财务负责人开放的原因",
      "改配置全部留审计日志"
    ],
    pitfalls: [
      {
        symptom: "改了个备注，结果银企连不上了",
        cause: "旧版本里保存时会把密码清空。现在不会——留空表示不改。",
        fix: "重新填一次证书密码。如果反复出现，检查是不是有别的地方在覆盖配置。"
      }
    ],
    flow: "配置 → 各业务模块读取使用",
    related: ["/payments", "/tax", "/knowledge"]
  }
];
