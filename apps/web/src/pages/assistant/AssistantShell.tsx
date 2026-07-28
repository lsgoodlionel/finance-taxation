import React, { type ReactNode } from "react";

/**
 * AI 助手页的外壳。
 *
 * 这一页刻意**不**套 TaskFocusShell（V10 的任务切换器）。核实过它的区块构成之后
 * 的结论是：它的问题不是「并排摊了几件事」，而是「在用户还没开口之前就先摆了两块
 * 与本轮对话无关的说明」——
 *
 *   - 对话本身天然就是一次一件事：一个会话流，一个输入框，上下文靠前后消息串起来。
 *     把它拆成 tab，用户每问一句都要想「这句该在哪个 tab 里问」，而 AI 的价值恰恰
 *     是「不用先分类就能开口」。切换 tab 还会把连续的上下文视觉上切断。
 *   - 真正要切换的东西（历史会话、决策/操作视角）已经在页头，且都是**同一个对话**
 *     的属性，不是并列的几件事。
 *
 * 所以这里保留会话式布局，只把「没有内容也照样占位」的块改成按需渲染：
 * flow 与 status 都是可选插槽，传 undefined / null 时整块不进 DOM。
 */
type AssistantShellProps = {
  header: ReactNode;
  flow?: ReactNode;
  status?: ReactNode;
  history?: ReactNode;
  chat: ReactNode;
  composer?: ReactNode;
};

export function AssistantShell({ header, flow, status, history, chat, composer }: AssistantShellProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", height: "calc(100vh - 180px)", maxHeight: "860px", position: "relative" }}>
      <section className="v3-hero-shell">{header}</section>
      {history}
      {status}
      {flow ? <section className="v3-section-shell" data-tone="accent">{flow}</section> : null}
      <section className="v3-chat-shell">
        <div className="v3-section-heading">
          <span className="v3-section-kicker">对话工作区</span>
          {/*
            改造前这里写的是「先看摘要，再在这里继续追问」——但摘要只有在 AI 识别出
            事项之后才存在，首屏根本没有摘要可看，标题指向一个不存在的东西。
            换成一句无论有没有上下文都成立的话。
          */}
          <h2 className="v3-section-title">直接问一句话，AI 会给出处理建议；识别出事项后可以在这里继续推进。</h2>
        </div>
        <div className="v3-chat-shell__body">
          {chat}
          {composer}
        </div>
      </section>
    </div>
  );
}
