export function KnowledgeAside() {
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <h4 style={{ margin: 0, fontSize: "13px", color: "#6c7a89" }}>AI 引用说明</h4>
      <p style={{ margin: 0, fontSize: "13px", color: "#6c7a89", lineHeight: 1.8 }}>
        启用中的条目会在「AI 财税秘书」对话时自动检索相关内容（关键词匹配，最多 5 条），
        作为制度参考注入系统上下文。建议将关键政策、公司制度、常见问答录入此处，
        以便 AI 给出更准确、符合公司口径的建议。
        <br />
        支持从 <strong>PDF、Word（.docx/.doc）</strong> 文件批量导入，AI 自动识别标题、分类、摘要和标签。
      </p>
    </div>
  );
}
