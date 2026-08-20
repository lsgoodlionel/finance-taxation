/**
 * 每页右上角的「本页指南」（V15）。
 *
 * ## 放在全局顶栏，不是每页各挂一个
 *
 * 改造前只有 5 个页面挂了帮助按钮，其余 20 多个没有——因为每挂一个都要在那个
 * 页面里写一段 JSX，而**「顺手写一段」是不会发生的**。
 *
 * 放进 `AppLayout` 的顶栏之后，每个页面自动就有；内容按当前路由从
 * `page-guides.ts` 取。新页面漏写指南由 `page-guides.test.ts` 拦下。
 *
 * ## 没有指南时不显示按钮
 *
 * 显示一个点开是空的按钮，比没有按钮更让人失望。
 */

import { useState } from "react";
import { Drawer, Space, Tag, Typography } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useLocation } from "react-router-dom";
import { findPageGuide } from "../../lib/page-guides";

export function PageGuideButton() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const guide = findPageGuide(location.pathname);

  // 点开是空的按钮比没有按钮更让人失望。
  if (guide === null) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`查看「${guide.title}」的内容与操作指南`}
        title="本页指南"
        style={{
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
        }}
      >
        <QuestionCircleOutlined />
        <span>本页指南</span>
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
