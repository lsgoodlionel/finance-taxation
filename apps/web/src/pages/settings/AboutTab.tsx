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

import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, Descriptions, Input, Space, Table, Tag, Typography } from "antd";
import { ExportOutlined, FilePdfOutlined, EyeOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PAGE_GUIDES, guideAnchorId, guideTitleOf, type PageGuide } from "../../lib/page-guides";
import {
  ADMIN_SETUP,
  DATA_FLOWS,
  FAQ,
  RHYTHM,
  ROLE_MATRIX,
  TROUBLESHOOTING
} from "../../lib/manual-content";
import { buildManualHtml } from "../../lib/manual-print";
import { TERMINOLOGY } from "../../lib/terminology";
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
  ],
  ["术语表", `${TERMINOLOGY.length} 条（界面上标注的专业词都可点开释义）`],
  ["常见问题", `${FAQ.length} 条 + 故障排查 ${TROUBLESHOOTING.length} 条`]
];

/**
 * 角色能做什么。
 *
 * 与后端 `middleware/auth.ts` 的 `ROLE_PERMISSIONS` 对应——
 * 那里是权威，这里是给人读的版本。
 */
export function AboutTab() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");

  /**
   * 在新窗口打开打印版说明书。
   *
   * 用 `Blob` + `createObjectURL` 而不是 `document.write`——后者在多数浏览器里
   * 已被弃用，且会把新窗口的 URL 留成 about:blank，用户想再打开一次只能回来点。
   *
   * 弹窗被拦时明确告诉用户，不静默失败。
   */
  const openManual = useCallback(() => {
    const html = buildManualHtml({
      // 公司名从设置里取不到时用通用称呼——手册的内容不依赖它。
      companyName: "本公司",
      generatedAt: new Date().toLocaleString("zh-CN")
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener");
    if (win === null) {
      URL.revokeObjectURL(url);
      toast.error("浏览器拦截了新窗口，请允许弹窗后重试");
      return;
    }
    // 不立刻 revoke：新窗口还要用这个 URL 加载。给足加载时间后再回收，
    // 不回收会让 blob 一直占着内存。
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, []);

  const filtered = useMemo(() => {
    const term = keyword.trim();
    if (term === "") return PAGE_GUIDES;
    // 搜索范围包含新增的四类内容——用户多半是拿着一个报错或一个字段名来搜的，
    // 只搜标题与步骤会搜不到。
    return PAGE_GUIDES.filter((guide) =>
      [
        guide.title,
        guide.route,
        guide.purpose,
        guide.audience,
        ...guide.steps,
        ...(guide.prerequisites ?? []),
        ...(guide.caution ?? []),
        ...(guide.fields ?? []).flatMap((f) => [f.name, f.meaning, f.note ?? ""]),
        ...(guide.pitfalls ?? []).flatMap((p) => [p.symptom, p.cause, p.fix])
      ]
        .join(" ")
        .includes(term)
    );
  }, [keyword]);

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="完整说明书可以在线预览，也能存成 PDF"
        description={
          <Space direction="vertical" size={8}>
            <span>
              说明书由系统<strong>实时生成</strong>——它与界面上每页右上角的「本页指南」
              读的是同一份数据，不会出现手册说一套、界面做另一套。
            </span>
            <Space>
              <Button type="primary" icon={<EyeOutlined />} onClick={openManual}>
                在线预览完整说明书
              </Button>
              <Button icon={<FilePdfOutlined />} onClick={openManual}>
                存为 PDF
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                预览页右下角有「打印 / 存为 PDF」，在打印对话框里选「另存为 PDF」
              </Typography.Text>
            </Space>
          </Space>
        }
      />

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

      <Card size="small" title="四、数据怎么流动">
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          用户问「我录的东西去哪了」时看这一节。
        </Typography.Paragraph>
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {DATA_FLOWS.map((flow) => (
            <div key={flow.title}>
              <Typography.Text strong>{flow.title}</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 2 }}>{flow.chain}</Typography.Paragraph>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
                {flow.note}
              </Typography.Paragraph>
            </div>
          ))}
        </Space>
      </Card>

      <Card
        size="small"
        title={`五、逐页说明（${PAGE_GUIDES.length} 个页面）`}
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
              <GuideSection
                key={guide.route}
                guide={guide}
                onOpenPage={(route) => navigate(route)}
              />
            ))}
          </Space>
        )}
      </Card>

      <Card size="small" title={`六、术语表（${TERMINOLOGY.length} 条）`}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          界面上带虚线下划线的专业词都能点开看释义，这里是全集。
        </Typography.Paragraph>
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={[...TERMINOLOGY]}
          columns={[
            { title: "术语", dataIndex: "term", width: 130 },
            { title: "白话", dataIndex: "plain", width: 150 },
            {
              title: "说明",
              key: "explain",
              render: (_, row) => (row.detail ? `${row.brief}。${row.detail}` : row.brief)
            }
          ]}
        />
      </Card>

      <Card size="small" title={`七、常见问题（${FAQ.length} 条）`}>
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {FAQ.map((item) => (
            <div key={item.question}>
              <Typography.Text strong>Q：{item.question}</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                A：{item.answer}
              </Typography.Paragraph>
            </div>
          ))}
        </Space>
      </Card>

      <Card size="small" title={`八、故障排查（${TROUBLESHOOTING.length} 条）`}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          这一节是「结果不对」而不是「用不了」的那类问题。
        </Typography.Paragraph>
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {TROUBLESHOOTING.map((item) => (
            <div key={item.question}>
              <Typography.Text strong>Q：{item.question}</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                A：{item.answer}
              </Typography.Paragraph>
            </div>
          ))}
        </Space>
      </Card>
    </Space>
  );
}

function GuideSection({
  guide,
  onOpenPage
}: {
  guide: PageGuide;
  onOpenPage: (route: string) => void;
}) {
  return (
    // 锚点 id 与页面指南里的「在完整手册中查看」对应——两处共用 guideAnchorId
    <div id={guideAnchorId(guide.route)} style={{ borderLeft: "3px solid #e2e8f0", paddingLeft: 14 }}>
      <Space size={8} wrap style={{ marginBottom: 4 }}>
        <Typography.Text strong style={{ fontSize: 15 }}>
          {guide.title}
        </Typography.Text>
        <Typography.Text code style={{ fontSize: 12 }}>
          {guide.route}
        </Typography.Text>
        <Tag>{guide.audience}</Tag>
        {/* 反向链接：从手册直接打开这个页面 */}
        <Button size="small" type="link" icon={<ExportOutlined />} onClick={() => onOpenPage(guide.route)}>
          打开这个页面
        </Button>
      </Space>

      {guide.permission !== undefined && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
          需要权限：{guide.permission}
        </Typography.Paragraph>
      )}

      <Typography.Paragraph style={{ marginBottom: 6 }}>{guide.purpose}</Typography.Paragraph>

      {guide.prerequisites !== undefined && guide.prerequisites.length > 0 && (
        <>
          <Typography.Text strong style={{ fontSize: 13 }}>
            用之前要先有
          </Typography.Text>
          <ul style={SUB_LIST}>
            {guide.prerequisites.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      <Typography.Text strong style={{ fontSize: 13 }}>
        怎么用
      </Typography.Text>
      <ol style={SUB_LIST}>
        {guide.steps.map((step) => (
          <li key={step}>{emphasize(step)}</li>
        ))}
      </ol>

      {guide.fields !== undefined && guide.fields.length > 0 && (
        <>
          <Typography.Text strong style={{ fontSize: 13 }}>
            关键字段
          </Typography.Text>
          <ul style={SUB_LIST}>
            {guide.fields.map((field) => (
              <li key={field.name}>
                <strong>{field.name}</strong>：{field.meaning}
                {field.note !== undefined && (
                  <span style={{ color: "#b45309" }}> {emphasize(field.note)}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {guide.caution !== undefined && guide.caution.length > 0 && (
        <ul style={{ ...SUB_LIST, color: "#b45309" }}>
          {guide.caution.map((item) => (
            <li key={item}>{emphasize(item)}</li>
          ))}
        </ul>
      )}

      {guide.pitfalls !== undefined && guide.pitfalls.length > 0 && (
        <>
          <Typography.Text strong style={{ fontSize: 13 }}>
            遇到问题
          </Typography.Text>
          <ul style={SUB_LIST}>
            {guide.pitfalls.map((item) => (
              <li key={item.symptom}>
                <strong>{item.symptom}</strong>
                <br />
                <span style={{ color: "#64748b" }}>原因：{item.cause}</span>
                <br />
                怎么办：{emphasize(item.fix)}
              </li>
            ))}
          </ul>
        </>
      )}

      {guide.flow !== undefined && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
          上下游：{guide.flow}
        </Typography.Paragraph>
      )}

      {guide.related !== undefined && guide.related.length > 0 && (
        <Space size={4} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            相关：
          </Typography.Text>
          {guide.related.map((route) => (
            <Button
              key={route}
              size="small"
              type="link"
              style={{ padding: "0 4px", fontSize: 12 }}
              onClick={() => {
                // 手册里的相关页面链接跳到手册的那一节，而不是打开页面——
                // 用户正在读手册，多半想接着读下一节而不是离开。
                document
                  .getElementById(guideAnchorId(route))
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {guideTitleOf(route)}
            </Button>
          ))}
        </Space>
      )}
    </div>
  );
}

const SUB_LIST: React.CSSProperties = {
  paddingLeft: 20,
  margin: "0 0 8px",
  lineHeight: 1.9,
  fontSize: 13
};

/** 把 `**强调**` 渲染成加粗。与打印版、页面指南共用同一套标记。 */
function emphasize(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}
