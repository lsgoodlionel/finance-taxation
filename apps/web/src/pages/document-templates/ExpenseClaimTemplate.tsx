import React from "react";
import type { ExpenseDocumentTemplateModel } from "../document-relations";
import {
  normalizeTemplateText,
  TemplateBulletList,
  TemplateCallout,
  TemplateKeyValueTable,
  TemplateSection
} from "./shared";

function buildTaskItems(model: ExpenseDocumentTemplateModel) {
  return model.relationSummary.tasks.map(
    (item) => `${item.title}｜${item.assigneeDepartment || "未分配部门"}｜${item.status}`
  );
}

function buildTaxItems(model: ExpenseDocumentTemplateModel) {
  return model.relationSummary.taxItems.map(
    (item) => `${item.taxType}｜${item.filingPeriod}｜${item.treatment}`
  );
}

function buildAttachmentItems(model: ExpenseDocumentTemplateModel) {
  return model.attachments.map((item) => `${item.fileName}｜${item.fileType || "未知类型"}`);
}

function buildVoucherItems(model: ExpenseDocumentTemplateModel) {
  return model.relationSummary.vouchers.map((item) => `${item.id}｜${item.summary}｜${item.status}`);
}

export function ExpenseClaimTemplate(props: { model: ExpenseDocumentTemplateModel }) {
  const { model } = props;

  return (
    <div>
      <TemplateSection title="单据信息">
        <TemplateKeyValueTable
          rows={[
            { label: "单据编号", value: normalizeTemplateText(model.documentId) },
            { label: "单据名称", value: normalizeTemplateText(model.title) },
            { label: "关联事项", value: normalizeTemplateText(model.businessEventId) },
            { label: "责任部门", value: normalizeTemplateText(model.ownerDepartment) },
            { label: "状态", value: normalizeTemplateText(model.status) },
            { label: "创建日期", value: normalizeTemplateText(model.createdOn) },
            { label: "归档日期", value: normalizeTemplateText(model.archivedOn) }
          ]}
        />
      </TemplateSection>

      <TemplateSection title="报销事由">
        <TemplateCallout>{normalizeTemplateText(model.notes, "无")}</TemplateCallout>
      </TemplateSection>

      <TemplateSection title="原始凭证附件">
        <TemplateBulletList items={buildAttachmentItems(model)} emptyText="暂无原始凭证附件" />
      </TemplateSection>

      <TemplateSection title="关联任务">
        <TemplateBulletList items={buildTaskItems(model)} emptyText="暂无关联任务" />
      </TemplateSection>

      <TemplateSection title="关联税务事项">
        <TemplateBulletList items={buildTaxItems(model)} emptyText="暂无关联税务事项" />
      </TemplateSection>

      <TemplateSection title="关联凭证">
        <TemplateBulletList items={buildVoucherItems(model)} emptyText="暂无关联凭证" />
      </TemplateSection>
    </div>
  );
}
