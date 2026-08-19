/**
 * 可折叠的说明块（V15）。
 *
 * ## 为什么要收起来
 *
 * 这个产品的说明文字是它的价值所在——「为什么这一步不能跳过」「写反了会
 * 怎么样」，那些话对第一次用的人是关键的。但它们**常驻在页面上**之后，
 * 第二次之后的每一次都在挡路：真正要看的数据被推到屏幕下半部分。
 *
 * 折叠解决的正是这个矛盾：**内容一个字不删，只是默认不占位置**。
 * 删掉说明去换清爽是把新手扔掉，而那批人正是这个产品要服务的。
 *
 * ## 默认收起，但记住每个人的选择
 *
 * 记忆按 `storageKey` 分开——报销页展开了不代表凭证页也要展开。
 * 第一次见到某一页的人应当看到收起的样子（页面先显得简单），
 * 展开过就说明他想看，下次直接给他。
 *
 * ## 不是 HelpPanel
 *
 * `HelpPanel` 是整页的帮助浮层（本页负责什么、上下游、标准流程）。
 * 这个是**某一个控件旁边的一句话**——「这个数为什么这么算」。
 * 两者层级不同，混在一起会让帮助浮层变成一本手册。
 */

import React, { useCallback, useState, type ReactNode } from "react";
import { Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";

const STORAGE_PREFIX = "ft.explain.";

/** 读取记忆的展开状态。无 window / 无记录时默认收起。 */
export function readExplainOpen(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`) === "1";
  } catch {
    return false;
  }
}

function persistExplainOpen(storageKey: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    // 收起时删键而不是写 0：默认就是收起，留一个 0 只是垃圾。
    if (open) window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, "1");
    else window.localStorage.removeItem(`${STORAGE_PREFIX}${storageKey}`);
  } catch {
    // localStorage 不可用（隐私模式）时降级为会话内状态。
  }
}

export interface ExplainProps {
  /**
   * 收起时显示的一行字。**它本身要有信息量**——
   * 写「说明」「帮助」等于让人必须展开才知道值不值得展开。
   */
  title: ReactNode;
  /** 记忆键。按页/按控件分开，不要全站共用一个。 */
  storageKey: string;
  /**
   * 强制默认展开。**只给「不看会做错」的说明用**，
   * 比如成本结转里三项完工程度那条。滥用它等于没有折叠。
   */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Explain({ title, storageKey, defaultOpen = false, children }: ExplainProps) {
  const [open, setOpen] = useState(() => defaultOpen || readExplainOpen(storageKey));

  const toggle = useCallback(() => {
    setOpen((prev) => {
      persistExplainOpen(storageKey, !prev);
      return !prev;
    });
  }, [storageKey]);

  const contentId = `explain-${storageKey.replace(/[^a-zA-Z0-9-]/g, "-")}`;

  return (
    <div
      style={{
        border: "1px solid #f0f0f0",
        borderRadius: 8,
        background: "#fafafa",
        marginBottom: 12
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
          color: "#595959"
        }}
      >
        {open ? <DownOutlined style={{ fontSize: 11 }} /> : <RightOutlined style={{ fontSize: 11 }} />}
        <Typography.Text style={{ fontSize: 13, color: "#595959" }}>{title}</Typography.Text>
      </button>

      {open && (
        <div id={contentId} style={{ padding: "0 12px 10px 31px", fontSize: 13, color: "#595959" }}>
          {children}
        </div>
      )}
    </div>
  );
}
