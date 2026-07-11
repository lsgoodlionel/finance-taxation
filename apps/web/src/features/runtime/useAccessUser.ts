import { useEffect, useState } from "react";
import { getCurrentUser } from "../../lib/api";

export interface AccessUserSummary {
  id: string;
  username: string;
  displayName: string;
  roleIds: string[];
  departmentName: string | null;
}

export function useAccessUser() {
  const [user, setUser] = useState<AccessUserSummary | null>(null);

  useEffect(() => {
    let active = true;
    void getCurrentUser()
      .then((next) => {
        if (active) {
          setUser(next);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return user;
}
