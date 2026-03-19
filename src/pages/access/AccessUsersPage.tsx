import { useState, useEffect } from "react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi, accessAgencyApi } from "@/lib/access-api";
import { useNavigate, Link, useLocation } from "react-router-dom";

export default function AccessUsersPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [agencyId, setAgencyId] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Agency users list (for AGENCY role)
  const [users, setUsers] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    if (user?.role === "AGENCY") fetchUsers();
  }, [user]);

  async function fetchUsers() {
    setListLoading(true);
    try {
      const res = await accessAgencyApi("/users");
      setUsers(res.users || []);
    } catch { }
    finally { setListLoading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      if (isAdmin) {
        await accessAdminApi("/users", { body: { name, email, password, status, agencyId: agencyId || undefined } });
      } else {
        await accessAgencyApi("/users", { body: { name, email, password, status } });
      }
      setMsg("User created successfully!");
      setName(""); setEmail(""); setPassword(""); setAgencyId("");
      if (!isAdmin) fetchUsers();
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() { logout(); navigate("/access/login"); }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div><strong>Access</strong><span>Control Panel</span></div>
        </div>
        <nav className="sidebar-nav">
          <Link className={`nav-item ${location.pathname === "/access/dashboard" ? "nav-item--active" : ""}`} to="/access/dashboard">Dashboard</Link>
          {isAdmin && <Link className={`nav-item ${location.pathname === "/access/accounts" ? "nav-item--active" : ""}`} to="/access/accounts">All Accounts</Link>}
          <Link className={`nav-item ${location.pathname === "/access/users" ? "nav-item--active" : ""}`} to="/access/users">{isAdmin ? "Create Users" : "My Users"}</Link>
          {isAdmin && <Link className={`nav-item ${location.pathname === "/access/agencies" ? "nav-item--active" : ""}`} to="/access/agencies">Create Agency</Link>}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__user">
            <div className="avatar" />
            <div><strong>{user?.name}</strong><span>{user?.role}</span></div>
            <button className="logout-btn" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <section style={{ padding: "24px 40px" }}>
          <h1 style={{ margin: "0 0 20px" }}>{isAdmin ? "Create User" : "Manage Your Users"}</h1>

          <div className="booking-card" style={{ marginBottom: "24px" }}>
            <form onSubmit={submit} style={{ display: "grid", gap: "14px", maxWidth: "500px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Full Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required
                  style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required
                  style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8}
                  style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Initial Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }}>
                  <option value="PENDING">Pending</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Agency ID (optional)</label>
                  <input value={agencyId} onChange={(e) => setAgencyId(e.target.value)} placeholder="Agency ID (leave empty for no agency)"
                    style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }} />
                </div>
              )}
              <button type="submit" className="auth-submit" disabled={loading} style={{ maxWidth: "200px" }}>
                {loading ? "Creating..." : "Create User"}
              </button>
              {msg && <p style={{ color: msg.includes("success") ? "#2e7d32" : "#c62828", fontSize: "14px" }}>{msg}</p>}
            </form>
          </div>

          {!isAdmin && (
            <>
              <h2 style={{ margin: "0 0 16px" }}>Your Users</h2>
              {listLoading ? <p>Loading...</p> : (
                <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: "12px", overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "#f5f7fa", textAlign: "left" }}>
                      <th style={{ padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 }}>Name</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 }}>Email</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} style={{ borderTop: "1px solid #e8ecf0" }}>
                        <td style={{ padding: "12px 16px" }}>{u.name}</td>
                        <td style={{ padding: "12px 16px" }}>{u.email}</td>
                        <td style={{ padding: "12px 16px" }}>{u.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {users.length === 0 && !listLoading && <p style={{ color: "#999" }}>No users yet</p>}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
