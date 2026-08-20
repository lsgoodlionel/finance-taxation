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
import { Drawer, Space, Tag, Typography } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useLocation } from "react-router-dom";
import { findPageGuide } from "../../lib/page-guides";

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
        width={520}
        title={`${guide.title} · 内容与操作指南`}
      >
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              适用对象
            </Typography.Text>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {guide.audience}
            </Typography.Paragraph>
          </div>

          <div>
            <Typography.Title level={5} style={{ marginBottom: 6 }}>
              这一页解决什么
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 0 }}>{guide.purpose}</Typography.Paragraph>
          </div>

          <div>
            <Typography.Title level={5} style={{ marginBottom: 6 }}>
              怎么用
            </Typography.Title>
            {/* 有序列表：这些是按顺序做的事，不是功能清单 */}
            <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 2 }}>
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {guide.caution !== undefined && guide.caution.length > 0 && (
            <div>
              <Typography.Title level={5} style={{ marginBottom: 6 }}>
                <Tag color="warning">注意</Tag>
                做错了会怎样
              </Typography.Title>
              <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2 }}>
                {guide.caution.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {guide.flow !== undefined && (
            <div>
              <Typography.Title level={5} style={{ marginBottom: 6 }}>
                上下游
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {guide.flow}
              </Typography.Paragraph>
            </div>
          )}

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            完整说明书在「系统中心 → 关于系统」，那里能一次读完全部页面。
          </Typography.Text>
        </Space>
      </Drawer>
    </>
  );
}
