/**
 * 全局搜索 / 命令面板（P1-4）
 * ⌘K / Ctrl+K 打开，跨事项/合同/发票/凭证/员工/任务/单据搜索并直达。
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, Input, List, Tag, Typography, Empty, Spin } from "antd";
import { SearchOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { globalSearch, type SearchResult } from "../lib/api";
import { filterSceneCommands, type SceneCommand } from "../lib/scene-commands";

const { Text } = Typography;

const TYPE_COLOR: Record<string, string> = {
  event: "blue", contract: "geekblue", invoice: "gold", voucher: "green",
  employee: "purple", task: "cyan", document: "default",
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<{ focus: () => void }>(null);

  useEffect(() => {
    if (open) {
      setQ(""); setResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // 防抖搜索
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 1) { setResults([]); return; }
    setLoading(true);
    const handle = setTimeout(() => {
      void globalSearch(term)
        .then((data) => setResults(data.results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [q, open]);

  const go = useCallback((r: SearchResult) => {
    onClose();
    navigate(r.path);
  }, [navigate, onClose]);

  const goScene = useCallback((cmd: SceneCommand) => {
    onClose();
    navigate(cmd.path);
  }, [navigate, onClose]);

  // 场景命令：按当前输入词过滤，未输入时展示全部（置顶常用入口）
  const sceneMatches = useMemo(() => filterSceneCommands(q), [q]);

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} width={600}
      styles={{ body: { padding: 0 } }} style={{ top: 80 }}>
      <Input
        ref={inputRef as never}
        size="large"
        bordered={false}
        prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
        placeholder="搜索事项 / 合同 / 发票 / 凭证 / 员工 / 任务 / 单据…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ borderBottom: "1px solid #f0f0f0", padding: "14px 16px" }}
      />
      <div style={{ maxHeight: 420, overflowY: "auto", padding: 8 }}>
        {sceneMatches.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ padding: "6px 12px 2px", fontSize: 12, color: "#94a3b8" }}>场景</div>
            <List
              size="small"
              dataSource={sceneMatches}
              renderItem={(cmd) => (
                <List.Item
                  onClick={() => goScene(cmd)}
                  style={{ cursor: "pointer", borderRadius: 8, padding: "8px 12px" }}
                  className="cmd-result-item"
                >
                  <List.Item.Meta
                    avatar={<ThunderboltOutlined style={{ color: "#faad14" }} />}
                    title={<span>{cmd.label}</span>}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{cmd.description}</Text>}
                  />
                  <Tag color="orange">场景</Tag>
                </List.Item>
              )}
            />
          </div>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center" }}><Spin /></div>
        ) : q.trim().length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            输入关键词开始搜索 · 支持名称 / 编号 / 摘要
          </div>
        ) : results.length === 0 ? (
          <Empty description={`未找到与「${q}」相关的内容`} style={{ padding: 24 }} />
        ) : (
          <List
            size="small"
            dataSource={results}
            renderItem={(r) => (
              <List.Item
                onClick={() => go(r)}
                style={{ cursor: "pointer", borderRadius: 8, padding: "8px 12px" }}
                className="cmd-result-item"
              >
                <List.Item.Meta
                  title={<span>{r.label}</span>}
                  description={<Text type="secondary" style={{ fontSize: 12 }}>{r.sublabel}</Text>}
                />
                <Tag color={TYPE_COLOR[r.type] ?? "default"}>{r.typeLabel}</Tag>
              </List.Item>
            )}
          />
        )}
      </div>
    </Modal>
  );
}

/** ⌘K / Ctrl+K 全局快捷键 hook。 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
