import { Navigate, useLocation } from "react-router-dom";

function mapLegacyTab(tab: string | null): { mode: string; source?: string } {
  switch ((tab || "").trim().toLowerCase()) {
    case "bible":
      return { mode: "bible" };
    case "worship":
      return { mode: "ministry", source: "worship" };
    case "media":
      return { mode: "ministry", source: "media" };
    case "countdown":
    case "ticker":
      return { mode: "ministry", source: tab === "ticker" ? "ticker" : "countdown" };
    case "graphics":
    case "speaker":
    case "ministry":
      return { mode: "ministry", source: "text" };
    default:
      return { mode: "ministry", source: "media" };
  }
}

export default function ServiceHubPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const legacyTab = params.get("tab");
  const mapped = mapLegacyTab(legacyTab);
  const next = new URLSearchParams();
  next.set("mode", mapped.mode);
  if (mapped.source) {
    next.set("source", mapped.source);
  }
  return <Navigate to={`/presentation/link?${next.toString()}`} replace />;
}
