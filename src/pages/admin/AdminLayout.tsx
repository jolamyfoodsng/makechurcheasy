/**
 * AdminLayout.tsx — Shell layout for the Admin Dashboard.
 * Renders AdminSidebar + child content via Outlet.
 */

import { Outlet, useNavigate, useLocation } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="admin-layout">
      <AdminSidebar
        currentPath={location.pathname}
        onNavigate={navigate}
      />
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
