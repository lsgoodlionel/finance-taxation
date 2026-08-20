/**
 * 关于系统 —— 完整的管理员与用户操作说明书（V15 重写）。
 *
 * ## 为什么重写
 *
 * 改造前这一页写着「V2 Final (2026-05-19)、业务页面 18 个」——**过时了十几个版本**，
 * 而一份说错的说明书比没有说明书更误导：读的人会按上面写的去找一个不存在的功能。
 *
 * ## 页面说明从 `page-guides.ts` 生成，不是另写一份
 *
 * 每页右上角的浮层与这份手册**读的是同一份数据**。分两份写迟早不一致，
 * 而不一致的手册比没有手册更糟。
 *
 * 这里只额外写「跨页面的事」：先做什么后做什么、角色能做什么、
 * 管理员要配什么——那些在单页指南里放不下。
 */

import { useMemo, useState } from "react";
import { Anchor, Card, Descriptions, Input, Space, Table, Tag, Typography } from "antd";
import { PAGE_GUIDES, type PageGuide } from "../../lib/page-guides";
import { Term } from "../../components/ui/Term";

/** 系统事实。**改了版本号要连同下面的能力清单一起改**，只改数字等于说谎。 */
const SYSTEM_FACTS: ReadonlyArray<readonly [string, string]> = [
  ["系统版本", "V15（2026-08）"],
  ["后端", "Node.js + TypeScript + PostgreSQL 17"],
  ["前端", "React 18 + TypeScript + Vite + Ant Design 5"],
  ["部署", "Docker Compose：db / api / web 三个服务"],
  ["数据库迁移", "87 个（001–095，含期初建账、审批流、成本结转、银企直连）"],
  ["业务页面", `${PAGE_GUIDES.length} 个（本页下方逐页说明）`],
  [
    "AI 后端",
    "Anthropic / OpenAI / DeepSeek / 智谱 / 通义千问 / 月之暗面 / 本地 Ollama"
  ]
];

/**
 * 角色能做什么。
 *
 * 与后端 `middleware/auth.ts` 的 `ROLE_PERMISSIONS` 对应——
 * 那里是权威，这里是给人读的版本。
 */
const ROLE_MATRIX: ReadonlyArray<{
  role: string;
  scope: string;
  cannot: string;
}> = [
  {
    role: "董事长 / 创始人",
    scope: "全部功能，含系统配置",
    cannot: "无限制。但仍受职责分离约束：复核过的凭证不能自己再过账"
  },
  {
    role: "财务负责人",
    scope: "全部业务功能 + 系统配置（V15 起）",
    cannot: "无业务限制。系统配置里的银企证书等于付款能力，操作全部留审计日志"
  },
  {
    role: "会计",
    scope: "记账、凭证、总账、报表、税务、成本结转、预算、报销审核",
    cannot: "不能改合同条款、不能配系统、不能管工资"
  },
  {
    role: "出纳",
    scope: "银行账户、流水导入、对账、付款、银企直连指令",
    cannot: "**不能记账**（无 ledger.post）——这是最基本的钱账分离"
  },
  {
    role: "税务专员",
    scope: "税务申报、税率、税务事项、研发辅助账",
    cannot: "不能记账、不能付款"
  },
  {
    role: "审计员",
    scope: "只读全部业务数据 + 审计日志",
    cannot: "**任何写操作**——审计的独立性靠这个保证"
  },
  {
    role: "员工",
    scope: "提申请、借款、报销，看自己的单据",
    cannot: "看不到别人的报销、进不了账务与税务"
  }
];

/** 管理员上手顺序。**顺序是有意义的**——跳步会让后面的步骤做不了。 */
const ADMIN_SETUP: ReadonlyArray<{ step: string; why: string }> = [
  {
    step: "1. 系统中心 → 公司信息：填工商与税务基本信息",
    why: "纳税人身份决定增值税怎么算，不填后面的税务功能判断不了"
  },
  {
    step: "2. 系统中心 → 银企直连（可选）：配对公付款账号与证书",
    why: "不配也能用，付款走导出 CSV 到网银上传"
  },
  {
    step: "3. 系统中心 → 外部对接：配发票服务商与通知渠道",
    why: "不配则发票只能手工录、通知不发送"
  },
  {
    step: "4. 制度库 → 费用标准 / 审批流：定报销标准与审批链",
    why: "**没有审批流，任何单据都提交不了**（会报「没有配置启用的审批流程」）"
  },
  {
    step: "5. 总账中心 → 录入期初余额",
    why: "**这是最关键的一步**。把启用系统之前的账面余额录进来，之后所有的账都建立在这个起点上。不做的话银行存款从零开始，报表全是错的"
  },
  {
    step: "6. 合同与往来 → 建往来单位，填银行账号与户名",
    why: "不填的话付款导出与银企直连都拿不到收款方"
  }
];

/** 日常节奏。写「什么时候做」，不写「有什么功能」。 */
const RHYTHM: ReadonlyArray<{ when: string; who: string; what: string }> = [
  { when: "每天", who: "员工", what: "提报销、提申请" },
  { when: "每天", who: "审批人", what: "在「我的审批」里处理待办" },
  { when: "每天", who: "会计", what: "记一笔 / 经营事项 → 凭证草稿" },
  { when: "每天", who: "出纳", what: "付款、导流水" },
  { when: "每周", who: "会计", what: "复核并过账凭证草稿" },
  { when: "每周", who: "出纳", what: "银行余额调节表对账" },
  {
    when: "每月末",
    who: "会计",
    what: "计提折旧 → 成本结转（制造业）→ 增值税结转 → 看试算平衡 → 出报表 → 锁账"
  },
  { when: "每月初", who: "税务专员", what: "申报各税种，导出申报文件" },
  { when: "每年末", who: "会计", what: "十二个月都锁账后，做**年度结转**" }
];

export function AboutTab() {
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const term = keyword.trim();
    if (term === "") return PAGE_GUIDES;
    return PAGE_GUIDES.filter((guide) =>
      [guide.title, guide.purpose, guide.audience, ...guide.steps, ...(guide.caution ?? [])]
        .join(" ")
        .includes(term)
    );
  }, [keyword]);

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <Card size="small" title="系统信息">
        <Descriptions size="small" column={2}>
          {SYSTEM_FACTS.map(([label, value]) => (
            <Descriptions.Item key={label} label={label}>
              {value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      </Card>

      <Card size="small" title="一、管理员上手顺序">
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          <strong>顺序是有意义的</strong>——跳步会让后面的步骤做不了。
        </Typography.Paragraph>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          {ADMIN_SETUP.map((item) => (
            <div key={item.step}>
              <Typography.Text strong>{item.step}</Typography.Text>
              <Typography.Paragraph
                type="secondary"
                style={{ marginBottom: 0, fontSize: 13, paddingLeft: 16 }}
              >
                {item.why}
              </Typography.Paragraph>
            </div>
          ))}
        </Space>
      </Card>

      <Card size="small" title="二、谁能做什么">
        <Table
          rowKey="role"
          size="small"
          pagination={false}
          dataSource={[...ROLE_MATRIX]}
          columns={[
            { title: "角色", dataIndex: "role", width: 150 },
            { title: "能做", dataIndex: "scope" },
            { title: "不能做", dataIndex: "cannot" }
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
          除角色权限外，系统还有两条<strong>不受角色影响</strong>的硬约束：
          <Term k="voucher">凭证</Term>的复核人 ≠ <Term k="posting">过账</Term>人、
          过账人 ≠ 终审人。董事长也绕不过去。
        </Typography.Paragraph>
      </Card>

      <Card size="small" title="三、日常节奏">
        <Table
          rowKey={(row) => `${row.when}-${row.who}-${row.what}`}
          size="small"
          pagination={false}
          dataSource={[...RHYTHM]}
          columns={[
            { title: "频率", dataIndex: "when", width: 90 },
            { title: "谁", dataIndex: "who", width: 110 },
            { title: "做什么", dataIndex: "what" }
          ]}
        />
      </Card>

      <Card
        size="small"
        title={`四、逐页说明（${PAGE_GUIDES.length} 个页面）`}
        extra={
          <Input.Search
            allowClear
            placeholder="搜索页面 / 操作 / 注意事项"
            style={{ width: 260 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          与每个页面右上角的「本页指南」<strong>读的是同一份数据</strong>——
          分两份写迟早不一致，而不一致的手册比没有手册更糟。
        </Typography.Paragraph>

        {filtered.length === 0 ? (
          <Typography.Text type="secondary">没有匹配的页面</Typography.Text>
        ) : (
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            {filtered.map((guide) => (
              <GuideSection key={guide.route} guide={guide} />
            ))}
          </Space>
        )}
      </Card>
    </Space>
  );
}

function GuideSection({ guide }: { guide: PageGuide }) {
  return (
    <div style={{ borderLeft: "3px solid #e2e8f0", paddingLeft: 14 }}>
      <Space size={8} wrap style={{ marginBottom: 4 }}>
        <Typography.Text strong style={{ fontSize: 15 }}>
          {guide.title}
        </Typography.Text>
        <Typography.Text code style={{ fontSize: 12 }}>
          {guide.route}
        </Typography.Text>
        <Tag>{guide.audience}</Tag>
      </Space>

      <Typography.Paragraph style={{ marginBottom: 6 }}>{guide.purpose}</Typography.Paragraph>

      <ol style={{ paddingLeft: 20, margin: "0 0 6px", lineHeight: 1.9, fontSize: 13 }}>
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {guide.caution !== undefined && guide.caution.length > 0 && (
        <ul
          style={{
            paddingLeft: 20,
            margin: "0 0 6px",
            lineHeight: 1.9,
            fontSize: 13,
            color: "#b45309"
          }}
        >
          {guide.caution.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {guide.flow !== undefined && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          上下游：{guide.flow}
        </Typography.Text>
      )}
    </div>
  );
}
