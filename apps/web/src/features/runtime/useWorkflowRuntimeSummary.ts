import { useEffect, useMemo, useRef, useState } from "react";
import { getWorkflowRuntimeSummary, type WorkflowRuntimeScope, type WorkflowRuntimeSummary } from "../../lib/api";

export function useWorkflowRuntimeSummary(
  scope: WorkflowRuntimeScope,
  params: Record<string, string | undefined>,
  fallback: WorkflowRuntimeSummary
) {
  const [summary, setSummary] = useState<WorkflowRuntimeSummary>(fallback);
  const [hasRemoteSummary, setHasRemoteSummary] = useState(false);
  const signature = useMemo(() => JSON.stringify({ scope, params }), [scope, params]);
  const fallbackSignature = useMemo(() => JSON.stringify(fallback), [fallback]);
  const fallbackRef = useRef(fallback);
  const lastFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);

  useEffect(() => {
    setHasRemoteSummary(false);
    setSummary(fallback);
    lastFetchKeyRef.current = null;
  }, [signature]);

  useEffect(() => {
    if (!hasRemoteSummary) {
      setSummary(fallbackRef.current);
    }
  }, [fallbackSignature, hasRemoteSummary]);

  useEffect(() => {
    let active = true;
    const fetchKey = `${scope}:${signature}`;
    if (lastFetchKeyRef.current === fetchKey) {
      return;
    }
    lastFetchKeyRef.current = fetchKey;

    void getWorkflowRuntimeSummary(scope, params)
      .then((next) => {
        if (active) {
          setHasRemoteSummary(true);
          setSummary(next);
        }
      })
      .catch(() => {
        if (active) {
          setHasRemoteSummary(false);
          setSummary(fallbackRef.current);
        }
      });

    return () => {
      active = false;
    };
  }, [scope, signature]);

  return summary;
}
