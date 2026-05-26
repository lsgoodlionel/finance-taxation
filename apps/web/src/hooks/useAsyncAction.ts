import { useState } from "react";

export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(action: () => Promise<T>) {
    setIsLoading(true);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      setError(message);
      throw caught;
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, error, run };
}
