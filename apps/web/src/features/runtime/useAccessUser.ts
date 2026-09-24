import { useEffect, useState } from "react";
import { getCurrentUser } from "../../lib/api";

export interface AccessUserSummary {
  id: string;
  username: string;
  displayName: string;
  roleIds: string[];
  /**
   * 这个人实际持有的权限键。
   *
   * 用它决定显示哪些按钮，**不要在前端按 roleIds 自己推**——
   * 那等于把后端的权限表复制一份，两份迟早漂移。
   */
  permissions?: string[];
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
