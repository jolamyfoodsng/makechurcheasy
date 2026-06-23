/**
 * AdminSidebar.tsx — Sidebar navigation for the Admin Dashboard.
 */

import { useCallback } from "react";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  CreditCard,
  Brain,
  Blocks,
  Church,
  LifeBuoy,
  Settings,
  Shield,
  ArrowLeft,
} from "lucide-react";

const NAV_ITEMS: { to: string; icon: any; label: string; exact?: boolean }[] = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview", exact: true },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/admin/payments", icon: CreditCard, label: "Payments" },
  { to: "/admin/ai-usage", icon: Brain, label: "AI Usage" },
  { to: "/admin/feature-usage", icon: Blocks, label: "Feature Usage" },
  { to: "/admin/churches", icon: Church, label: "Churches" },
  { to: "/admin/support", icon: LifeBuoy, label: "Support" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

interface AdminSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export default function AdminSidebar({ currentPath, onNavigate }: AdminSidebarProps) {
  const isActive = useCallback(
    (to: string, exact?: boolean) => {
      if (exact) return currentPath === to;
      return currentPath.startsWith(to);
    },
    [currentPath]
  );

  return (
    <nav className="admin-sidebar">
      <div className="admin-sidebar-header">
        <span className="admin-badge">
          <Shield />
          Admin
        </span>
      </div>

      <div className="admin-sidebar-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => (
          <button
            key={to}
            className={`admin-sidebar-link ${isActive(to, exact) ? "admin-sidebar-link-active" : ""}`}
            onClick={() => onNavigate(to)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <button
        className="admin-sidebar-footer"
        onClick={() => onNavigate("/")}
      >
        <ArrowLeft />
        <span>Back to App</span>
      </button>
    </nav>
  );
}
