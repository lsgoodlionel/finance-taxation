import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export function applyQueryState(search: string, key: string, value: string) {
  const params = new URLSearchParams(search);
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
  return params.toString();
}

export function useQueryState(key: string, fallback = "") {
  const [params, setParams] = useSearchParams();
  const value = useMemo(() => params.get(key) ?? fallback, [fallback, key, params]);

  function setValue(next: string) {
    const queryString = applyQueryState(params.toString(), key, next);
    setParams(new URLSearchParams(queryString));
  }

  return [value, setValue] as const;
}
