/**
 * StepMedia — Interactive Media assets preview widget for onboarding.
 *
 * Reproduces the media library workflow: category browsing, asset selection,
 * custom text overlay, and fullscreen preview — all self-contained with mock data.
 */

import { useState } from "react";
import {
  Layers,
  Grid,
  Eye,
  Check,
  ChevronRight,
} from "lucide-react";

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
      <div className="ob-media-widget">
        {/* Left rail */}
        <div className="ob-media-rail">
          <div className="ob-media-rail-icon ob-media-rail-icon--active">
            <Layers size={14} />
          </div>
          <div className="ob-media-rail-icon">
            <Grid size={14} />
          </div>
        </div>

        {/* Main — categories + asset grid */}
        <div className="ob-media-main">
          {/* Category tabs */}
          <div className="ob-media-tabs">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`ob-media-tab${cat === category ? " is-active" : ""}`}
              >
                {cat === "all" ? "All Media" : cat}
              </button>
            ))}
          </div>

          {/* Asset grid */}
          <div className="ob-media-grid">
            {filtered.map((asset) => {
              const sel = asset.id === selectedId;
              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedId(asset.id)}
                  className={`ob-media-card${sel ? " is-selected" : ""}`}
                >
                  <div className="ob-media-card-bg" style={{ background: asset.gradient }} />
                  <div className="ob-media-card-overlay" />
                  <div className="ob-media-card-content">
                    <p className="ob-media-card-text">{asset.overlayText}</p>
                    <span className="ob-media-card-category">{asset.category}</span>
                  </div>
                  {sel && (
                    <div className="ob-media-card-check">
                      <Check size={10} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel — details */}
        <div className="ob-media-details">
          <div className="ob-media-details-header">
            <span className="ob-media-details-label">Details</span>
            <span className="ob-media-details-title">{selected.title}</span>
          </div>

          <div className="ob-media-details-body">
            <div className="ob-media-details-field">
              <span className="ob-media-details-field-label">Custom Text Overlay</span>
              <input
                type="text"
                placeholder="Type overlay caption..."
                value={customText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomText(e.target.value)}
                className="ob-media-details-input"
              />
            </div>
            <div className="ob-media-details-meta">Aspect: 16:9 HD Ready</div>
          </div>

          <button
            className="ob-media-zoom-btn"
            onClick={() => setShowPreview(true)}
          >
            <Eye size={12} />
            Zoom Slide
          </button>
        </div>

        {/* Fullscreen preview overlay */}
        {showPreview && (
          <div className="ob-media-fullscreen-overlay" onClick={() => setShowPreview(false)}>
            <div
              className="ob-media-fullscreen-card"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="ob-media-fullscreen-bg" style={{ background: selected.gradient }} />
              <div className="ob-media-fullscreen-darken" />
              <div className="ob-media-fullscreen-content">
                <h4 className="ob-media-fullscreen-heading">
                  {customText || selected.overlayText}
                </h4>
                <span className="ob-media-fullscreen-sub">{selected.title}</span>
              </div>
              <button
                className="ob-media-fullscreen-close"
                onClick={() => setShowPreview(false)}
              >
                ✕ Close
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
          <button className="ob-btn ob-btn--secondary" onClick={onNext}>
            <ChevronRight size={14} />
            Next: Install Dock
          </button>
        </div>
        <button className="ob-btn ob-btn--primary" onClick={onNext}>
          Continue
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
