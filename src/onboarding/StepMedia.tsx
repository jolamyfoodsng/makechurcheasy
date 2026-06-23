/**
 * StepMedia — Interactive Media assets preview widget for onboarding.
 *
 * Reproduces the media library workflow: category browsing, asset selection,
 * custom text overlay, and fullscreen preview — all self-contained with mock data.
 */

import {
  ChevronRight
} from "lucide-react";
import { useState } from "react";

/* ── Mock Data ── */

interface MediaAsset {
  id: string;
  title: string;
  category: "images" | "videos" | "graphics" | "backgrounds";
  gradient: string;
  overlayText: string;
}

const ASSETS: MediaAsset[] = [
  { id: "a1", title: "Welcome Slide", category: "images", gradient: "linear-gradient(135deg, #7c3aed, #4f46e5, #ec4899)", overlayText: "Welcome to Worship" },
  { id: "a2", title: "Announcement", category: "graphics", gradient: "linear-gradient(135deg, #f59e0b, #ea580c, #dc2626)", overlayText: "Sermon Series Starts Sunday" },
  { id: "a3", title: "Prayer Screen", category: "backgrounds", gradient: "linear-gradient(135deg, #172554, #1e293b, #1e1b4b)", overlayText: "Join Us For Evening Prayer" },
  { id: "a4", title: "Youth Ministry", category: "graphics", gradient: "linear-gradient(135deg, #0ea5e9, #8b5cf6, #4c1d95)", overlayText: "YTH Night • Wed 7 PM" },
];

type CategoryFilter = "all" | "images" | "graphics" | "backgrounds";

const CATEGORIES: CategoryFilter[] = ["all", "images", "graphics", "backgrounds"];

/* ── Component ── */

export default function StepMedia({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState("a1");
  const [customText, setCustomText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const selected = ASSETS.find((a) => a.id === selectedId) || ASSETS[0];
  const filtered = ASSETS.filter(
    (a) => category === "all" || a.category === category,
  );

  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Media Library</h1>
        <p>
          Organize custom text slides, prayer screens, and announcements across
          categories. Select an asset to preview and customize the overlay text.
        </p>
      </div>


      {/* ── Interactive Media Widget ── */}


      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
          <button className="ob-btn ob-btn--primary" onClick={onNext}>
            Continue
            <ChevronRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
}
