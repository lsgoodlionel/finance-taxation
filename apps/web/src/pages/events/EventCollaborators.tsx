/**
 * 事项协作人（V15/P1）。
 *
 * 事项可见性从「同部门都能看」收敛到「负责人 + 显式协作人」之后，
 * **这里就是把人加进来的唯一入口**。没有它，收敛就变成了「同事突然看不见了」。
 *
 * 默认收起：绝大多数事项只有负责人一个人，展开的空名单是纯噪音。
 */
import { useEffect, useState } from "react";
import {
  addEventCollaborator,
  listCompanyMembers,
  listEventCollaborators,
  removeEventCollaborator,
  type EventCollaborator
} from "../../lib/api-events";
import { Explain } from "../../components/ui/Explain";

interface EventCollaboratorsProps {
  businessEventId: string;
}

const ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap" as const,
  fontSize: 13
};

export function EventCollaborators({ businessEventId }: EventCollaboratorsProps) {
  const [items, setItems] = useState<EventCollaborator[]>([]);
  const [members, setMembers] = useState<{ id: string; displayName: string }[]>([]);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [collaborators, companyMembers] = await Promise.all([
          listEventCollaborators(businessEventId),
          listCompanyMembers()
        ]);
        if (cancelled) return;
        setItems(collaborators.items);
        setMembers(companyMembers.items);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        // 加载失败要说出来。静默的空名单会让人以为「这条事项没有协作人」，
        // 然后重复添加已经在里面的人。
        setError(loadError instanceof Error ? loadError.message : "协作人加载失败");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [businessEventId]);

  async function run(action: () => Promise<{ items: EventCollaborator[] }>) {
    setBusy(true);
    try {
      const next = await action();
      setItems(next.items);
      setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  const candidates = members.filter((member) => !items.some((item) => item.userId === member.id));

  return (
    <Explain title={`协作人（${items.length}）`} storageKey="event-collaborators">
      <div style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "#5b6b7b" }}>
          只有负责人和这里列出的人能看到这条事项。加进来的人**看得到、但改不了**——
          修改仍然只有负责人和有指派权限的人可以做。
        </p>

        {items.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#7a8794" }}>还没有协作人。</p>
        ) : (
          items.map((item) => (
            <div key={item.userId} style={ROW_STYLE}>
              <span>{item.displayName}</span>
              {item.source === "migrated" && (
                // 说清来路：这条不是谁加的，是升级时从「同部门可见」固化下来的。
                <span style={{ fontSize: 11, color: "#9aa5b4" }}>（由原部门可见范围保留）</span>
              )}
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy}
                onClick={() => void run(() => removeEventCollaborator(businessEventId, item.userId))}
              >
                移出
              </button>
            </div>
          ))
        )}

        <div style={ROW_STYLE}>
          <select
            value={picked}
            onChange={(event) => setPicked(event.target.value)}
            aria-label="选择要添加的协作人"
          >
            <option value="">选择成员…</option>
            {candidates.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy || !picked}
            onClick={() =>
              void run(async () => {
                const next = await addEventCollaborator(businessEventId, picked);
                setPicked("");
                return next;
              })
            }
          >
            添加协作人
          </button>
        </div>

        {error && <p style={{ margin: 0, fontSize: 12.5, color: "#b42318" }}>{error}</p>}
      </div>
    </Explain>
  );
}
