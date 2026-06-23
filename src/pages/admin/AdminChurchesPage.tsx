import { useState, useEffect, useMemo } from "react";
import { Church, Users, Search, ArrowUpDown, Loader2 } from "lucide-react";
import { fetchChurches, type Church as ChurchType } from "../../services/adminService";
import "./Admin.css";

type SortColumn = "name" | "userCount" | "plan";
type SortDirection = "asc" | "desc";

export default function AdminChurchesPage() {
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("userCount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(true);
  const [churches, setChurches] = useState<ChurchType[]>([]);

  useEffect(() => {
    fetchChurches().then((data) => {
      setChurches(data);
      setLoading(false);
    });
  }, []);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("desc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return churches
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        let cmp = 0;
        if (sortColumn === "name") cmp = a.name.localeCompare(b.name);
        else if (sortColumn === "userCount") cmp = a.userCount - b.userCount;
        else if (sortColumn === "plan") cmp = a.plan.localeCompare(b.plan);
        return sortDirection === "asc" ? cmp : -cmp;
      });
  }, [churches, search, sortColumn, sortDirection]);

  const mostActive = useMemo(
    () => [...churches].sort((a, b) => b.userCount - a.userCount)[0],
    [churches],
  );

  const SortIcon = ({ col }: { col: SortColumn }) => (
    <ArrowUpDown size={12} style={{ opacity: sortColumn === col ? 1 : 0.3, marginLeft: 4, verticalAlign: "middle" }} />
  );

  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>Churches</h1>
          <p>Track churches and user engagement</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px", gap: 8, color: "var(--text-muted)" }}>
          <Loader2 size={18} className="spin" />
          Loading churches…
        </div>
      ) : (
        <>
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Total Churches</span>
              <span className="admin-kpi-value">{churches.length}</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Largest Church</span>
              <span className="admin-kpi-value" style={{ fontSize: 18 }}>
                {mostActive?.name ?? "—"}
              </span>
              <span className="admin-kpi-sub">{mostActive?.userCount ?? 0} users</span>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-header">
              <span className="admin-card-title">All Churches</span>
              <div className="admin-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Search churches..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
                      Church Name <SortIcon col="name" />
                    </th>
                    <th onClick={() => handleSort("userCount")} style={{ cursor: "pointer" }}>
                      Users <SortIcon col="userCount" />
                    </th>
                    <th onClick={() => handleSort("plan")} style={{ cursor: "pointer" }}>
                      Top Plan <SortIcon col="plan" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500, color: "var(--text)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Church size={14} style={{ opacity: 0.5 }} />
                          {c.name}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Users size={12} style={{ opacity: 0.4 }} />
                          {c.userCount}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-plan-badge admin-badge-${c.plan}`}>
                          {c.plan}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                        No churches found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
