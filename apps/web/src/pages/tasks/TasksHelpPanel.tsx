/**
 * 任务中心 · 帮助面板。
 *
 * 改造前这是页面里手写的一个浮层，内部又叠了 3 条 Alert（三个中心的关系、
 * 看板拖拽说明、逾期提示），和首屏那 4 条横幅一起构成「9 处 Alert」。
 * 现在换成全站统一的 HelpPanel（标准五段结构，自带焦点陷阱与 Esc 关闭），
 * 顺带把原先常驻首屏的「拖拽卡片推进任务」操作说明收进这里——
 * 那是一次性学会的用法，不该每次打开页面都占一条横幅。
 */
import React from "react";
import { HelpPanel } from "../../components/ui/HelpPanel";
import { Term } from "../../components/ui/Term";

interface TasksHelpPanelProps {
  open: boolean;
  onClose: () => void;
}

export function TasksHelpPanel({ open, onClose }: TasksHelpPanelProps) {
  return (
    <HelpPanel
      open={open}
      title="任务中心 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>任务中心</strong>是执行入口；<strong>单据中心</strong>负责补齐发票、回单；
          <strong><Term k="voucher">凭证</Term>中心</strong>负责最终入账。三者之中任务中心最靠前。
        </>
      )}
      workflowSteps={[
        "系统按经营事项拆出任务并分派到责任部门",
        "在看板里把卡片拖到目标列，或在列表里点「开始执行」推进状态",
        "缺资料就回单据中心补齐，补齐后回到这里继续推进",
        "任务做完后确认关闭；有父子任务时，先推完子任务再收口父任务"
      ]}
      responsibility="这里只负责「谁在什么时候把哪件事推到哪一步」，不产生原始资料、也不直接记账。"
      operations="拖拽卡片到目标列即可更新状态；已完成的任务不能再拖到其他列。逾期任务以红色高亮，可用「催办」提醒责任人。"
      caution="任务长期卡住时，先在详情里看流程条的「现在这步」在等什么：是资料没补齐、还是子任务没做完，再回对应页面处理，不要直接把状态改成已完成。"
    />
  );
}
