import { useState, useMemo } from "react";
import { Typography, Empty, Badge } from "antd";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { ContractWithEventCount } from "@finance-taxation/domain-model";
import { updateContract, closeContract } from "../../lib/api";
import { ContractKanbanCard } from "./ContractKanbanCard";

const { Text } = Typography;

type ContractStatus = "draft" | "active" | "fulfilled" | "terminated" | "expired";

const COLUMNS: Array<{
  id: ContractStatus | "closed";
  label: string;
  statuses: ContractStatus[];
  color: string;
  bgColor: string;
}> = [
  { id: "draft",     label: "起草中", statuses: ["draft"],                color: "#64748b", bgColor: "#f1f5f9" },
  { id: "active",    label: "履行中", statuses: ["active"],               color: "#2563eb", bgColor: "#eff6ff" },
  { id: "fulfilled", label: "待关闭", statuses: ["fulfilled"],            color: "#d97706", bgColor: "#fffbeb" },
  { id: "closed",    label: "已关闭", statuses: ["terminated", "expired"], color: "#6b7280", bgColor: "#f9fafb" },
];

// Maps target column key to the status to set via API
const COLUMN_TO_STATUS: Record<string, ContractStatus | null> = {
  draft: "draft",
  active: "active",
  fulfilled: "fulfilled",
  closed: "terminated",
};

interface Props {
  contracts: ContractWithEventCount[];
  onSelectContract?: (id: string) => void;
  onContractStatusChange?: (id: string, newStatus: string) => void;
}

export function ContractKanbanView({ contracts, onSelectContract, onContractStatusChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localContracts, setLocalContracts] = useState(contracts);

  // Keep local in sync when parent updates
  useMemo(() => { setLocalContracts(contracts); }, [contracts]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const byColumn = useMemo(() => {
    const map = new Map<string, ContractWithEventCount[]>();
    COLUMNS.forEach((col) => map.set(col.id, []));
    for (const c of localContracts) {
      if (c.status === "terminated" || c.status === "expired") {
        map.get("closed")!.push(c);
      } else if (map.has(c.status)) {
        map.get(c.status as string)!.push(c);
      }
    }
    return map;
  }, [localContracts]);

  const activeContract = activeId
    ? localContracts.find((c) => c.id === activeId) ?? null
    : null;

  function findColumnForContract(id: string): string | null {
    for (const col of COLUMNS) {
      if (byColumn.get(col.id)?.some((c) => c.id === id)) return col.id;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedId = active.id as string;
    const overId = over.id as string;

    const sourceColumn = findColumnForContract(draggedId);

    // Determine target column: if over is a column id, use it; otherwise find column of the card
    type ColId = "draft" | "active" | "fulfilled" | "closed";
    let targetColumn: ColId | null = (COLUMNS.find((c) => c.id === overId)?.id ?? null) as ColId | null;
    if (!targetColumn) targetColumn = findColumnForContract(overId) as ColId | null;
    if (!targetColumn || targetColumn === sourceColumn) return;

    const newStatus = COLUMN_TO_STATUS[targetColumn];
    if (!newStatus) return;

    const draggedContract = localContracts.find((c) => c.id === draggedId);
    if (!draggedContract) return;

    // Optimistic update
    setLocalContracts((prev) =>
      prev.map((c) => c.id === draggedId ? { ...c, status: newStatus } : c)
    );

    try {
      if (targetColumn === "closed") {
        await closeContract(draggedId, "terminated");
      } else {
        await updateContract(draggedId, { status: newStatus });
      }
      onContractStatusChange?.(draggedId, newStatus);
      toast.success(`合同已移至「${COLUMNS.find((c) => c.id === targetColumn)?.label}」`);
    } catch (err) {
      // Roll back optimistic update
      setLocalContracts((prev) =>
        prev.map((c) => c.id === draggedId ? draggedContract : c)
      );
      toast.error(err instanceof Error ? err.message : "状态更新失败");
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(220px, 1fr))",
          gap: 16,
          overflowX: "auto",
          paddingBottom: 8,
        }}
      >
        {COLUMNS.map((col) => {
          const items = byColumn.get(col.id) ?? [];
          return (
            <div key={col.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "10px 10px 0 0",
                  background: col.bgColor,
                  borderBottom: `2px solid ${col.color}22`,
                  marginBottom: 4,
                }}
              >
                <Text strong style={{ fontSize: 13, color: col.color }}>
                  {col.label}
                </Text>
                <Badge
                  count={items.length}
                  style={{ backgroundColor: col.color, fontSize: 10 }}
                  showZero
                  size="small"
                />
              </div>

              {/* Drop zone + cards */}
              <div
                id={col.id}
                style={{
                  background: col.bgColor,
                  borderRadius: "0 0 10px 10px",
                  padding: 8,
                  minHeight: 200,
                  border: `1px solid ${col.color}22`,
                  borderTop: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {items.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={<span style={{ fontSize: 12, color: "#94a3b8" }}>暂无合同</span>}
                      style={{ margin: "24px 0" }}
                    />
                  ) : (
                    items.map((c) => (
                      <ContractKanbanCard
                        key={c.id}
                        contract={c}
                        onClick={onSelectContract}
                      />
                    ))
                  )}
                </SortableContext>
              </div>
            </div>
          );
        })}
      </div>

      {createPortal(
        <DragOverlay>
          {activeContract && (
            <ContractKanbanCard contract={activeContract} isOverlay />
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
