import { useState } from "react";

type DrawerState<T> = {
  isOpen: boolean;
  value: T | null;
  open(value: T): void;
  close(): void;
};

export function createDrawerState<T>(): DrawerState<T> {
  return {
    isOpen: false,
    value: null,
    open(value: T) {
      this.isOpen = true;
      this.value = value;
    },
    close() {
      this.isOpen = false;
      this.value = null;
    }
  };
}

export function useDrawer<T>() {
  const [value, setValue] = useState<T | null>(null);

  return {
    isOpen: value !== null,
    value,
    open(next: T) {
      setValue(next);
    },
    close() {
      setValue(null);
    }
  };
}
