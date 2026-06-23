/**
 * AdminGate.tsx — Gate component that only renders children if user is admin.
 * Redirects to home if not admin.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, loading, navigate]);

  if (loading) return null;
  if (!isAdmin) return null;

  return <>{children}</>;
}
