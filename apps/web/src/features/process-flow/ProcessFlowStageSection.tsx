import { ProcessFlowCard } from "./ProcessFlowCard";
import { buildProcessFlowPageContext } from "./page-context";
import type { ProcessFlowBranch } from "./types";

interface ProcessFlowStageSectionProps {
  title: string;
  subtitle: string;
  currentNodeId: string;
  businessEventId?: string;
  branch?: ProcessFlowBranch | null;
}

export function ProcessFlowStageSection({
  title,
  subtitle,
  currentNodeId,
  businessEventId,
  branch
}: ProcessFlowStageSectionProps) {
  if (branch && branch !== "common") {
    return (
      <ProcessFlowCard
        mode="inline"
        title={title}
        subtitle={subtitle}
        activeBranch={branch}
        currentNodeId={currentNodeId}
        businessEventId={businessEventId}
      />
    );
  }

  const pageContext = buildProcessFlowPageContext({
    currentNodeId,
    branch,
    businessEventId
  });

  return (
    <ProcessFlowCard
      mode="inline"
      title={title}
      subtitle={subtitle}
      currentNodeId={pageContext.currentNodeId}
      nodes={pageContext.nodes}
      businessEventId={pageContext.businessEventId}
    />
  );
}
