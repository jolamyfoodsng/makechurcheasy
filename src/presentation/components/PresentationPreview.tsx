interface PresentationPreviewProps {
  presentationLink: string;
  label: string;
  live?: boolean;
  waitingCopy?: string;
}

export function PresentationPreview({
  presentationLink,
  label,
  live = false,
  waitingCopy = "Nothing selected yet.",
}: PresentationPreviewProps) {
  return (
    <section className="presentation-preview-card">
      <div className="presentation-preview-card__head">
        <div>
          <div className="presentation-panel-title">{label}</div>
          <div className="presentation-preview-card__subhead">
            {live ? "Remote screen output" : "Local preview"}
          </div>
        </div>
        <span className={`presentation-preview-badge${live ? " is-live" : ""}`}>
          {live ? "Live" : "Preview"}
        </span>
      </div>

      <div className="presentation-preview-stage">
        {presentationLink ? (
          <iframe
            className="presentation-preview-iframe"
            src={presentationLink}
            title="Live Presentation"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="presentation-preview-empty">{waitingCopy}</div>
        )}
      </div>
    </section>
  );
}
