import { PageHeader } from "../../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type KnowledgeHeaderProps = {
  /** 当前正在做的这件事的名称，接在标题后面，让页头也说清「现在在干什么」。 */
  activeTaskLabel: string;
};

/**
 * 页头只负责「这是哪一页 / 现在在做哪件事」。
 *
 * 改造前它还挂着「从文件导入」文件选择器和「+ 新增条目」按钮——两个入口分别
 * 通往两件互不相干的事，却常驻在每一件事的上方。现在它们各自回到自己的任务里：
 * 文件选择器在「从文件导入制度」的工作区，录入表单在「手工录入一条」。
 */
export function KnowledgeHeader({ activeTaskLabel }: KnowledgeHeaderProps) {
  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <PageHeader
        title={activeTaskLabel ? `企业制度库 · ${activeTaskLabel}` : "企业制度库"}
        subtitle={buildResultPageSubtitle("制度库")}
      />
      <div className="v3-banner" data-tone="info" style={{ fontSize: "13px" }}>
        启用中的条目会被「AI 财税秘书」自动检索引用。下面一次只显示一件事，切换上方的标签即可换成另一件。
      </div>
    </div>
  );
}
