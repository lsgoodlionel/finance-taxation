import { HelpPanel } from "../../components/ui/HelpPanel";

export interface EventsHelpPanelProps {
  open: boolean;
  onClose: () => void;
}

export function EventsHelpPanel({ open, onClose }: EventsHelpPanelProps) {
  return (
    <HelpPanel
      open={open}
      title="经营事项总线 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>经营事项页</strong>是整个流程的起点，负责记录业务背景和 AI 分析结果。后续会把事项拆到<strong>任务中心</strong>推进执行，沉淀到<strong>单据中心</strong>、<strong>凭证中心</strong>和<strong>税务中心</strong>，最终由<strong>风险勾稽中心</strong>做横向检查和闭环跟踪。
        </>
      )}
      workflowSteps={[
        "录入业务描述、金额、部门和发生日期",
        "执行 AI 分析，识别业务类型、生成任务和处理建议",
        "根据分析结果补单据、做凭证、形成税务事项",
        "由任务中心推进执行，必要时触发风险检查",
        "业务完成后进入归档、申报和风险关闭阶段"
      ]}
      responsibility="这里负责定义“发生了什么业务”，并把业务转换成系统内可执行、可追踪的经营事项。它不直接代替单据归档、记账、申报，而是为下游页面提供统一来源。"
      operations="常见操作包括：新建事项、查看 AI 分析结果、更新事项状态、查看任务树、查看流程位置、执行风险检查。若本页描述、金额或类型录入错误，后续单据、凭证和税务结果都会偏移。"
      caution="事项页是业务源头。发现描述不完整、金额错误或类型判断不准时，应先在这里纠正，再继续后续单据、凭证和税务处理。"
    />
  );
}
