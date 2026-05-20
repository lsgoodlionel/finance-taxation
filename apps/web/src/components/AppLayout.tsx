import { type FormEvent, useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getStoredToken, getCurrentUser, login, logoutSession } from "../lib/api";

interface User {
  id: string;
  username: string;
  displayName: string;
  roleIds: string[];
}

const navGroups = [
  {
    label: "概览",
    items: [
      { to: "/dashboard/chairman", label: "董事长驾驶舱", icon: "◈" }
    ]
  },
  {
    label: "经营管理",
    items: [
      { to: "/events", label: "经营事项总线", icon: "⋯" },
      { to: "/contracts", label: "合同管理", icon: "◻" },
      { to: "/payroll", label: "工资管理", icon: "◑" },
      { to: "/tasks", label: "任务中心", icon: "◎" }
    ]
  },
  {
    label: "财务运营",
    items: [
      { to: "/documents", label: "单据中心", icon: "◷" },
      { to: "/vouchers", label: "凭证中心", icon: "◈" },
      { to: "/ledger", label: "总账中心", icon: "≡" },
      { to: "/reports", label: "财务报表", icon: "∥" }
    ]
  },
  {
    label: "税务人力",
    items: [
      { to: "/tax", label: "税务中心", icon: "◉" }
    ]
  },
  {
    label: "研发风控",
    items: [
      { to: "/rnd", label: "研发辅助账", icon: "◊" },
      { to: "/risk", label: "风险勾稽", icon: "⚑" },
      { to: "/audit", label: "审计日志", icon: "◌" }
    ]
  },
  {
    label: "AI 与工具",
    items: [
      { to: "/assistant", label: "AI 财税助手", icon: "✦" },
      { to: "/knowledge", label: "制度库", icon: "⊞" },
      { to: "/pdf-export", label: "PDF 导出", icon: "↓" }
    ]
  },
  {
    label: "系统",
    items: [
      { to: "/settings", label: "系统设置", icon: "⚙" }
    ]
  }
];

function LoginGate({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(username, password);
      onLogin(result.user as User);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--c-bg)"
      }}
    >
      <div
        className="card"
        style={{ width: 360, padding: "36px 32px" }}
      >
        <div style={{ marginBottom: 24 }}>
          <div className="sidebar-brand-name" style={{ color: "var(--c-text)", fontSize: 20 }}>
            Finance Taxation V2
          </div>
          <div className="sidebar-brand-sub" style={{ color: "var(--c-text-muted)", marginTop: 4 }}>
            企业财税工作台 · 请登录
          </div>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group">
            <label className="form-label">用户名</label>
            <input
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? "登录中…" : "登录"}
          </button>
        </form>
        <div style={{ marginTop: 16, fontSize: 12, color: "var(--c-text-light)", textAlign: "center" }}>
          默认账户：chairman / 123456 &nbsp;|&nbsp; finance / 123456
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setChecking(false);
      return;
    }
    getCurrentUser()
      .then(u => setUser(u as User))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  async function handleLogout() {
    try {
      await logoutSession();
    } catch {
      localStorage.removeItem("finance-taxation-v2-token");
      localStorage.removeItem("finance-taxation-v2-refresh-token");
    }
    setUser(null);
    navigate("/");
  }

  if (checking) {
    return (
      <div className="state-loading" style={{ marginTop: 80 }}>
        正在加载…
      </div>
    );
  }

  if (!user) {
    return <LoginGate onLogin={setUser} />;
  }

  const initials = (user.displayName || user.username || "U").slice(0, 2).toUpperCase();
  const roleLabel = user.roleIds.includes("chairman") ? "董事长" :
    user.roleIds.includes("cfo") ? "财务总监" :
    user.roleIds.includes("accountant") ? "会计" : "成员";

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-name">Finance Taxation V2</div>
          <div className="sidebar-brand-sub">企业财税工作台</div>
        </div>

        <nav className="sidebar-nav">
          {navGroups.map(group => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    "sidebar-link" + (isActive ? " active" : "")
                  }
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name">{user.displayName || user.username}</div>
            <div className="sidebar-user-role">{roleLabel}</div>
          </div>
          <button
            className="sidebar-logout"
            onClick={handleLogout}
            title="退出登录"
          >
            ⏻
          </button>
        </div>
      </aside>

      <div className="app-main">
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
