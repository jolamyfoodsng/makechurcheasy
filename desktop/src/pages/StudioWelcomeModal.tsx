import { useEffect, useState } from "react";
import { BookOpen, Image as ImageIcon, Monitor, Music, Sparkles } from "lucide-react";
import ModalDialog from "../components/ModalDialog";
import { clearStudioWelcomePending, hasStudioWelcomePending } from "../services/workspacePreference";
import "./StudioWelcomeModal.css";

export default function StudioWelcomeModal() {
  const [open, setOpen] = useState(() => hasStudioWelcomePending());

  useEffect(() => {
    if (open) clearStudioWelcomePending();
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);

  return (
    <ModalDialog
      tone="brand"
      icon={<Sparkles size={25} />}
      title="Welcome to MakeChurchEazy Studio"
      width={580}
      onClose={close}
      hint="Studio works without OBS. You can connect OBS later from the banner or Settings."
      actions={[{ label: "Start exploring", variant: "primary", autoFocus: true, onClick: close }]}
    >
      <p>Your presentation workspace is ready. Prepare your service here, then preview before sending anything to your church displays.</p>
      <div className="studio-welcome-steps">
        <div className="studio-welcome-step">
          <span className="studio-welcome-step__icon"><BookOpen size={17} /></span>
          <span><strong>Bible</strong><small>Find a passage and prepare Scripture slides.</small></span>
        </div>
        <div className="studio-welcome-step">
          <span className="studio-welcome-step__icon"><Music size={17} /></span>
          <span><strong>Worship &amp; notes</strong><small>Bring song lyrics and service notes into your presentation.</small></span>
        </div>
        <div className="studio-welcome-step">
          <span className="studio-welcome-step__icon"><ImageIcon size={17} /></span>
          <span><strong>Media</strong><small>Prepare images and videos for your service.</small></span>
        </div>
        <div className="studio-welcome-step">
          <span className="studio-welcome-step__icon"><Monitor size={17} /></span>
          <span><strong>Preview, then project</strong><small>Check your selection before sending it to a display.</small></span>
        </div>
      </div>
    </ModalDialog>
  );
}
