import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/dashboard/chairman", label: "董事长驾驶舱" },
  { to: "/events", label: "经营事项总线" },
  { to: "/contracts", label: "合同管理" },
  { to: "/payroll", label: "工资管理" },
  { to: "/assistant", label: "AI 财税秘书" },
  { to: "/pdf-export", label: "PDF 导出" },
  { to: "/tasks", label: "任务中心" },
  { to: "/documents", label: "单据中心" },
  { to: "/vouchers", label: "凭证中心" },
  { to: "/ledger", label: "总账中心" },
  { to: "/reports", label: "财务报表" },
  { to: "/tax", label: "税务中心" },
  { to: "/rnd", label: "研发辅助账" },
  { to: "/risk", label: "风险勾稽" },
  { to: "/audit", label: "审计日志" }
];

export function AppLayout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f7f4ea 0%, #eef5fb 45%, #e9f1e3 100%)",
        color: "#1e2a37",
        fontFamily: "\"PingFang SC\", \"Microsoft YaHei\", sans-serif"
      }}
    >
      <header
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "24px 24px 12px"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "20px"
          }}
        >
          <div>
            <div style={{ color: "#6c7a89", letterSpacing: "0.08em", fontSize: "12px" }}>
              PHASE 3 · AI 财税工作台
            </div>
            <h1 style={{ margin: "8px 0 0", fontSize: "28px" }}>
              Finance Taxation V2 Workspace
            </h1>
          </div>
          <nav style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  textDecoration: "none",
                  color: isActive ? "#ffffff" : "#1e2a37",
                  background: isActive ? "#1e2a37" : "rgba(255,255,255,0.72)",
                  border: "1px solid rgba(20,40,60,0.08)",
                  borderRadius: "999px",
                  padding: "10px 16px",
                  fontSize: "14px"
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "12px 24px 40px" }}>
        <Outlet />
      </main>
    </div>
  );
}
