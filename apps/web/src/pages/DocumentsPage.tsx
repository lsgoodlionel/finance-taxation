import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GeneratedDocument, Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import {
  API_BASE_URL,
  archiveDocument,
  getDocumentDetail,
  listDocuments,
  listTasks,
  listTaxItems,
  listVouchers,
  uploadDocumentFileRaw,
  type DocumentDetail
} from "../lib/api";
import { buildPrintableDocumentHtml } from "./document-relations";
import { normalizeDrilldownState } from "./drilldown";
import { buildDocumentsSummary } from "./documents/documents-helpers";
import { DocumentsShell } from "./documents/DocumentsShell";
import { DocumentsHeader } from "./documents/DocumentsHeader";
import { DocumentsSummary } from "./documents/DocumentsSummary";
import { DocumentsList } from "./documents/DocumentsList";
import { DocumentDetailPanel } from "./documents/DocumentDetailPanel";
import { DocumentsHelpModal } from "./documents/DocumentsHelpModal";

const TOKEN_KEY = "finance-taxation-v2-token";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function DocumentsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = normalizeDrilldownState(location.state);
  const navEventId = navState.businessEventId ?? null;
  const navDocumentId = navState.documentId ?? null;

  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [relatedTasks, setRelatedTasks] = useState<(Task & { isOverdue?: boolean })[]>([]);
  const [relatedTaxItems, setRelatedTaxItems] = useState<TaxItem[]>([]);
  const [relatedVouchers, setRelatedVouchers] = useState<Voucher[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [message, setMessage] = useState("正在加载单据数据...");
  const [uploading, setUploading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadRelations(businessEventId: string | null) {
    if (!businessEventId) {
      setRelatedTasks([]);
      setRelatedTaxItems([]);
      setRelatedVouchers([]);
      return;
    }
    const [tasksPayload, taxPayload, voucherPayload] = await Promise.all([
      listTasks(businessEventId),
      listTaxItems({ businessEventId }),
      listVouchers({ businessEventId })
    ]);
    setRelatedTasks(tasksPayload.items);
    setRelatedTaxItems(taxPayload.items);
    setRelatedVouchers(voucherPayload.items);
  }

  async function bootstrap() {
    try {
      const [docsPayload, vouchersPayload] = await Promise.all([listDocuments(), listVouchers()]);
      setDocuments(docsPayload.items);
      setVouchers(vouchersPayload.items);
      const linkedId = navDocumentId
        ? docsPayload.items.find((d) => d.id === navDocumentId)?.id ?? null
        : navEventId
        ? docsPayload.items.find((d) => d.businessEventId === navEventId)?.id ?? null
        : null;
      const targetId = linkedId ?? docsPayload.items[0]?.id ?? null;
      setSelectedDocumentId(targetId);
      if (targetId) {
        const nextDetail = await getDocumentDetail(targetId);
        setDetail(nextDetail);
        await loadRelations(nextDetail.businessEventId);
      } else {
        await loadRelations(null);
      }
      setMessage(`已加载 ${docsPayload.total} 个单据。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, [navDocumentId, navEventId]);

  async function refreshListAndDetail(documentId?: string) {
    const payload = await listDocuments();
    setDocuments(payload.items);
    const targetId = documentId ?? selectedDocumentId ?? payload.items[0]?.id ?? null;
    setSelectedDocumentId(targetId);
    if (targetId) {
      const nextDetail = await getDocumentDetail(targetId);
      setDetail(nextDetail);
      await loadRelations(nextDetail.businessEventId);
    } else {
      setDetail(null);
      await loadRelations(null);
    }
  }

  async function handleSelectDocument(docId: string) {
    setSelectedDocumentId(docId);
    const nextDetail = await getDocumentDetail(docId);
    setDetail(nextDetail);
    await loadRelations(nextDetail.businessEventId);
  }

  async function handleUploadFile(file: File) {
    if (!detail) return;
    if (file.size > MAX_FILE_SIZE) {
      setMessage("文件过大（最大 20MB）");
      return;
    }
    setUploading(true);
    setMessage(`正在上传 ${file.name}...`);
    try {
      await uploadDocumentFileRaw(detail.id, file);
      await refreshListAndDetail(detail.id);
      setMessage(`附件「${file.name}」已上传并挂载到单据。`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleArchive() {
    if (!detail) return;
    await archiveDocument(detail.id);
    await refreshListAndDetail(detail.id);
    setMessage("单据已归档。");
  }

  async function handleDownload(attachmentId: string, fileName: string) {
    const token = window.localStorage.getItem(TOKEN_KEY) ?? "";
    const resp = await fetch(`${API_BASE_URL}/api/attachments/${attachmentId}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) { setMessage("下载失败"); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handlePrintDocument() {
    if (!detail) return;
    const html = buildPrintableDocumentHtml({
      document: detail,
      tasks: relatedTasks,
      taxItems: relatedTaxItems,
      vouchers: relatedVouchers
    });
    const printableWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printableWindow) {
      setMessage("无法打开打印窗口");
      return;
    }
    printableWindow.document.open();
    printableWindow.document.write(html);
    printableWindow.document.close();
    setMessage(`已打开「${detail.title}」打印版。`);
  }

  const summary = buildDocumentsSummary(documents);

  return (
    <>
      {showHelp && <DocumentsHelpModal onClose={() => setShowHelp(false)} />}
      <DocumentsShell
        header={<DocumentsHeader onOpenHelp={() => setShowHelp(true)} />}
        summary={<DocumentsSummary summary={summary} message={message} />}
        list={(
          <DocumentsList
            documents={documents}
            vouchers={vouchers}
            selectedDocumentId={selectedDocumentId}
            onSelect={(docId) => void handleSelectDocument(docId)}
          />
        )}
        detail={(
          <DocumentDetailPanel
            detail={detail}
            tasks={relatedTasks}
            taxItems={relatedTaxItems}
            vouchers={relatedVouchers}
            uploading={uploading}
            fileInputRef={fileInputRef}
            onUpload={(file) => void handleUploadFile(file)}
            onDownload={(id, name) => void handleDownload(id, name)}
            onPrint={handlePrintDocument}
            onArchive={() => void handleArchive()}
            onViewTasks={() => navigate("/tasks", { state: { businessEventId: detail?.businessEventId } })}
            onViewTax={() => navigate("/tax", { state: { businessEventId: detail?.businessEventId } })}
            onViewVouchers={() => navigate("/vouchers", { state: { businessEventId: detail?.businessEventId } })}
          />
        )}
      />
    </>
  );
}
