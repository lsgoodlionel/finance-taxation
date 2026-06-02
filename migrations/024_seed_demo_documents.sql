-- 演示数据：为单据中心补充示例单据（关联种子经营事项）
-- 幂等：ON CONFLICT DO NOTHING；引用 002 种子事项 evt-019/020/027/028

insert into event_document_mappings (id, company_id, business_event_id, document_type, title, status, owner_department, notes)
values
  ('edm-doc-001','cmp-tech-001','evt-019','tax_filing_form','2026年4月增值税申报表','generated','财务','增值税月报申报底稿'),
  ('edm-doc-002','cmp-tech-001','evt-020','tax_filing_form','2026年4月个税扣缴申报表','generated','财务','个人所得税扣缴申报'),
  ('edm-doc-003','cmp-tech-001','evt-027','asset_disposal_form','旧固定资产处置单','generated','行政','旧路由器及办公桌椅处置'),
  ('edm-doc-004','cmp-tech-001','evt-028','expense_claim','公益捐赠与罚款支出单','generated','财务','交通违章罚款及公益捐赠')
on conflict (id) do nothing;

insert into generated_documents (id, company_id, business_event_id, mapping_id, document_type, title, owner_department, status, source, archived_at, created_at, updated_at)
values
  ('doc-001','cmp-tech-001','evt-019','edm-doc-001','tax_filing_form','2026年4月增值税申报表','财务','ready','analysis',null,now() - interval '20 days',now()),
  ('doc-002','cmp-tech-001','evt-020','edm-doc-002','tax_filing_form','2026年4月个税扣缴申报表','财务','awaiting_upload','analysis',null,now() - interval '18 days',now()),
  ('doc-003','cmp-tech-001','evt-027','edm-doc-003','asset_disposal_form','旧固定资产处置单','行政','archived','analysis',now() - interval '5 days',now() - interval '15 days',now()),
  ('doc-004','cmp-tech-001','evt-028','edm-doc-004','expense_claim','公益捐赠与罚款支出单','财务','draft','analysis',null,now() - interval '10 days',now())
on conflict (id) do nothing;
