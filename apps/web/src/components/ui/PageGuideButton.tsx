/**
 * 每页右上角的「本页指南」（V15）。
 *
 * ## 两个位置，各有分工
 *
 * 改造前只有 5 个页面挂了帮助按钮——因为每挂一个都要在那个页面里写 JSX，
 * 而「顺手写一段」是不会发生的。所以做成组件 + 注册表，两处自动渲染：
 *
 * 1. **`PageHeader` 里**（页面标题那一行的右上角）——用户最先看的地方。
 *    这个应用里页面级操作（刷新、新建、导出）本来就都在那儿。
 * 2. **全局顶栏**（面包屑那一行）——给**没有用 `PageHeader` 的 8 个页面**兜底
 *    （总账、报表、税务、风险、审计、制度库、AI 助手、工资域，它们有自己的页头）。
 *
 * 两处同时出现会重复，所以顶栏那个用 `fallbackOnly`：只在当前页面没有渲染过
 * 页头版本时才显示。判断靠一个渲染计数器，而不是猜路由——**路由白名单会在
 * 页面改用/弃用 `PageHeader` 时悄悄失准**，而失准的表现（按钮消失或出现两个）
 * 不会报错。
 *
 * ## 没有指南时不显示按钮
 *
 * 显示一个点开是空的按钮，比没有按钮更让人失望。
 */

import React, { useEffect, useState } from "react";
import { Button, Divider, Drawer, Space, Table, Tag, Typography } from "antd";
import { BookOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { findPageGuide, guideAnchorId, guideTitleOf } from "../../lib/page-guides";

/**
 * 当前路径。**不在 Router 里时返回 null 而不是抛错。**
 *
 * `PageHeader` 现在渲染这个按钮，而页头的单测是纯渲染（不套 Router）——
 * 让组件为了一个辅助按钮就强依赖路由上下文是本末倒置：那会逼着每一处用到
 * 页头的测试都去套一个 Router，而它们测的根本不是路由。
 *
 * 拿不到路径就不显示按钮，页头的其余部分照常渲染。
 */
function useOptionalPathname(): string | null {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- try/catch 只为兜住
    // 「不在 Router 内」这一种情况；同一棵树里它的结果是稳定的，不会时有时无。
    return useLocation().pathname;
  } catch {
    return null;
  }
}

/** 当前视图里已渲染的页头版指南按钮数量。 */
let pageHeaderGuideCount = 0;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) fn();
}

export interface PageGuideButtonProps {
  /**
   * 只在页面没有渲染页头版按钮时显示。全局顶栏用这个。
   *
   * **不是「顶栏专用」的意思**——它表达的是「我是兜底的那个」，
   * 而兜底与否由实际渲染情况决定，不由位置决定。
   */
  fallbackOnly?: boolean;
  /**
   * 紧凑形态：只显示图标，用在移动端深色顶栏上。
   *
   * **窄屏更需要这个按钮**——屏幕小、页面上能放的提示更少，
   * 第一版只加在桌面顶栏是漏了。
   */
  compact?: boolean;
}

export function PageGuideButton({
  compact = false,
  fallbackOnly = false
}: PageGuideButtonProps = {}) {
  const pathname = useOptionalPathname();
  const navigate = useOptionalNavigate();
  const [open, setOpen] = useState(false);
  const [headerCount, setHeaderCount] = useState(pageHeaderGuideCount);
  const guide = pathname === null ? null : findPageGuide(pathname);

  // 页头版的挂载与卸载都要通知兜底版重新判断。
  useEffect(() => {
    if (fallbackOnly) {
      const update = () => setHeaderCount(pageHeaderGuideCount);
      subscribers.add(update);
      update();
      return () => {
        subscribers.delete(update);
      };
    }

    pageHeaderGuideCount += 1;
    notify();
    return () => {
      pageHeaderGuideCount -= 1;
      notify();
    };
  }, [fallbackOnly]);

  // 点开是空的按钮比没有按钮更让人失望。
  if (guide === null) return null;
  // 页面自己的页头已经有一个了，兜底版就不重复显示。
  if (fallbackOnly && headerCount > 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`查看「${guide.title}」的内容与操作指南`}
        title="本页指南"
        style={
          compact
            ? {
                // 深色顶栏上的图标按钮，与旁边的搜索、期间选择器同一套外观。
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                padding: "0 4px",
                color: "#f1f5f9",
                fontSize: 16
              }
            : {
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                background: "#f1f5f9",
                border: "1px solid rgba(20,40,60,0.1)",
                borderRadius: 8,
                padding: "5px 12px",
                color: "#475569",
                fontSize: 13
              }
        }
      >
        <QuestionCircleOutlined />
        {!compact && <span>本页指南</span>}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={600}
        title={`${guide.title} · 内容与操作指南`}
        extra={
          navigate !== null ? (
            <Button
              size="small"
              icon={<BookOutlined />}
              onClick={() => {
                setOpen(false);
                // 跳到手册里这一页对应的那一节。锚点由 guideAnchorId 生成——
                // 两处共用同一个函数，各写一份字符串处理迟早跳不到。
                navigate(`/settings?tab=about#${guideAnchorId(guide.route)}`);
              }}
            >
              在完整手册中查看
            </Button>
          ) : null
        }
      >
        <Space direction="vertical" size={18} style={{ width: "100%" }}>
          <div>
            <Space size={6} wrap>
              <Tag>{guide.audience}</Tag>
              {guide.permission !== undefined && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  需要权限：{guide.permission}
                </Typography.Text>
              )}
            </Space>
            <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
              {guide.purpose}
            </Typography.Paragraph>
          </div>

          {/* 前置条件排在操作之前——「做不了」多半是这里没满足，
              放在后面等于让人先撞一次墙 */}
          {guide.prerequisites !== undefined && guide.prerequisites.length > 0 && (
            <Section title="用之前要先有">
              <ul style={LIST_STYLE}>
                {guide.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="怎么用">
            {/* 有序列表：这些是按顺序做的事，不是功能清单 */}
            <ol style={LIST_STYLE}>
              {guide.steps.map((step) => (
                <li key={step}>{renderEmphasis(step)}</li>
              ))}
            </ol>
          </Section>

          {guide.fields !== undefined && guide.fields.length > 0 && (
            <Section title="关键字段怎么填">
              <Table
                rowKey="name"
                size="small"
                pagination={false}
                dataSource={[...guide.fields]}
                columns={[
                  { title: "字段", dataIndex: "name", width: 130 },
                  {
                    title: "说明",
                    key: "meaning",
                    render: (_, row) => (
                      <Space direction="vertical" size={2}>
                        <span>{row.meaning}</span>
                        {row.note !== undefined && (
                          <Typography.Text type="warning" style={{ fontSize: 12 }}>
                            {renderEmphasis(row.note)}
                          </Typography.Text>
                        )}
                      </Space>
                    )
                  }
                ]}
              />
            </Section>
          )}

          {guide.caution !== undefined && guide.caution.length > 0 && (
            <Section title="做错了会怎样">
              <ul style={{ ...LIST_STYLE, color: "#b45309" }}>
                {guide.caution.map((item) => (
                  <li key={item}>{renderEmphasis(item)}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* 「按步骤做了但结果不对」——从症状写起，因为用户只知道看到了什么 */}
          {guide.pitfalls !== undefined && guide.pitfalls.length > 0 && (
            <Section title="遇到问题">
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {guide.pitfalls.map((item) => (
                  <div key={item.symptom}>
                    <Typography.Text strong>{item.symptom}</Typography.Text>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
                      原因：{item.cause}
                    </Typography.Paragraph>
                    <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13 }}>
                      怎么办：{renderEmphasis(item.fix)}
                    </Typography.Paragraph>
                  </div>
                ))}
              </Space>
            </Section>
          )}

          {guide.flow !== undefined && (
            <Section title="上下游">
              <Typography.Text type="secondary">{guide.flow}</Typography.Text>
            </Section>
          )}

          {/* 相关页面可点——「做完这一步该去哪」是用户的下一个问题 */}
          {guide.related !== undefined && guide.related.length > 0 && navigate !== null && (
            <Section title="相关页面">
              <Space wrap>
                {guide.related.map((route) => (
                  <Button
                    key={route}
                    size="small"
                    onClick={() => {
                      setOpen(false);
                      navigate(route);
                    }}
                  >
                    {guideTitleOf(route)}
                  </Button>
                ))}
              </Space>
            </Section>
          )}

          <Divider style={{ margin: "4px 0" }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            完整说明书在「系统中心 → 关于系统」，可在线预览与存为 PDF。
          </Typography.Text>
        </Space>
      </Drawer>
    </>
  );
}

const LIST_STYLE: React.CSSProperties = { paddingLeft: 20, margin: 0, lineHeight: 2 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography.Title level={5} style={{ marginBottom: 6 }}>
        {title}
      </Typography.Title>
      {children}
    </div>
  );
}

/**
 * 把正文里的 `**强调**` 渲染成加粗。
 *
 * 指南内容是给人读的散文，强调用得不少。**与打印版共用同一套标记**——
 * 两边用不同的标记会让同一句话在两处长得不一样。
 */
function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

/**
 * 导航函数。**不在 Router 里时返回 null**，理由与 `useOptionalPathname` 相同：
 * 页头的纯渲染测试不该被迫套一个 Router。
 */
function useOptionalNavigate(): ReturnType<typeof useNavigate> | null {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- 同上，只兜「不在 Router 内」
    return useNavigate();
  } catch {
    return null;
  }
}
