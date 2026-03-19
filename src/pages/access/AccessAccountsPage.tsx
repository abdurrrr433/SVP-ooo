import { useState, useEffect } from "react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi } from "@/lib/access-api";
import { useNavigate, Link, useLocation } from "react-router-dom";

interface Account {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  agency_id?: string;
  created_at: string;
}

export default function AccessAccountsPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  async function fetchAccounts() {
    setLoading(true);
    try {
      let query = "/accounts";
      const params: string[] = [];
      if (filterRole) params.push(`role=${filterRole}`);
      if (filterStatus) params.push(`status=${filterStatus}`);
      if (params.length) query += `?${params.join("&")}`;
      const res = await accessAdminApi(query);
      setAccounts(res.accounts || []);
    } catch (err: any) {
      setMsg(err?.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAccounts();
  }, [filterRole, filterStatus]);

  async function changeStatus(id: string, status: string) {
    try {
      await accessAdminApi(`/accounts/${id}/status`, { method: "PATCH", body: { status } });
      setMsg(`Status updated to ${status}`);
      fetchAccounts();
    } catch (err: any) {
      setMsg(err?.message || "Failed to update status");
    }
  }

  function handleLogout() {
    logout();
    navigate("/access/login");
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <strong>Access</strong>
            <span>Control Panel</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <Link className={`nav-item ${location.pathname === "/access/dashboard" ? "nav-item--active" : ""}`} to="/access/dashboard">Dashboard</Link>
          <Link className={`nav-item ${location.pathname === "/access/accounts" ? "nav-item--active" : ""}`} to="/access/accounts">All Accounts</Link>
          <Link className={`nav-item ${location.pathname === "/access/users" ? "nav-item--active" : ""}`} to="/access/users">Create Users</Link>
          <Link className={`nav-item ${location.pathname === "/access/agencies" ? "nav-item--active" : ""}`} to="/access/agencies">Create Agency</Link>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__user">
            <div className="avatar" />
            <div>
              <strong>{user?.name || "Admin"}</strong>
              <span>{user?.role}</span>
            </div>
            <button className="logout-btn" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <section style={{ padding: "24px 40px" }}>
          <h1 style={{ margin: "0 0 16px" }}>All Accounts</h1>

          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
            <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #ccc" }}>
              <option value="">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="AGENCY">Agency</option>
              <option value="USER">User</option>
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #ccc" }}>
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>

          {msg && <div className="error-card" style={{ background: "#e8f5e9", color: "#2e7d32" }}>{msg}</div>}

          {loading ? (
            <p>Loading...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: "12px", overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "#f5f7fa", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 }}>Name</th>
                    <th style={{ padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 }}>Email</th>
                    <th style={{ padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 }}>Role</th>
                    <th style={{ padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 }}>Status</th>
                    <th style={{ padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id} style={{ borderTop: "1px solid #e8ecf0" }}>
                      <td style={{ padding: "12px 16px" }}>{acc.name}</td>
                      <td style={{ padding: "12px 16px" }}>{acc.email}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 700,
                          background: acc.role === "ADMIN" ? "#ede7f6" : acc.role === "AGENCY" ? "#e3f2fd" : "#f1f8e9",
                          color: acc.role === "ADMIN" ? "#6a1b9a" : acc.role === "AGENCY" ? "#1565c0" : "#33691e",
                        }}>
                          {acc.role}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 700,
                          background: acc.status === "ACTIVE" ? "#e8f5e9" : acc.status === "BLOCKED" ? "#ffebee" : "#fff3e0",
                          color: acc.status === "ACTIVE" ? "#2e7d32" : acc.status === "BLOCKED" ? "#c62828" : "#e65100",
                        }}>
                          {acc.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {acc.status !== "ACTIVE" && (
                            <button onClick={() => changeStatus(acc.id, "ACTIVE")}
                              style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #4caf50", background: "#e8f5e9", color: "#2e7d32", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                              Approve
                            </button>
                          )}
                          {acc.status !== "BLOCKED" && (
                            <button onClick={() => changeStatus(acc.id, "BLOCKED")}
                              style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #ef5350", background: "#ffebee", color: "#c62828", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                              Block
                            </button>
                          )}
                          {acc.status !== "PENDING" && (
                            <button onClick={() => changeStatus(acc.id, "PENDING")}
                              style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #ff9800", background: "#fff3e0", color: "#e65100", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                              Pending
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {accounts.length === 0 && <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>No accounts found</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
