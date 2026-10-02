import FeatureShowcase from "./feature-showcase";
import { Check, Folder, Image as ImageIcon, Megaphone, Play, RefreshCw, Settings2, Zap } from "lucide-react";
import styles from "./media-beside-obs-showcase.module.css";

const benefits = [
  { icon: Folder, text: "Keep your media library beside OBS" },
  { icon: RefreshCw, text: "Reuse images and videos without uploading them again" },
  { icon: Zap, text: "Send media live in under a second" },
  { icon: Settings2, text: "Create and update media sources automatically" },
];

export default function MediaBesideObsShowcase() {
  return (
    <FeatureShowcase
      id="media" eyebrow="Media beside OBS"
      heading={<>Keep every image and video <span>right beside you inside OBS.</span></>}
      description={[
        "You don’t need to upload your media to OBS every time you want to use it. MakeChurchEasy keeps your worship backgrounds, sermon clips, announcements, and service media ready beside your OBS workflow.",
        "Choose what you need, send it live, and let MakeChurchEasy create or update the source automatically.",
      ]}
      benefits={benefits}
      microcopy="Your media is always ready—right where you need it."
      href="/features/media" linkLabel="Learn more"
    >
        <div className={styles.visual}>
          <div className={styles.screenshotStage}>
            <img
              src="/homepage/media.webp"
              alt="MakeChurchEazy media dock inside OBS Studio with worship lyrics and media library"
              width={1024}
              height={640}
              loading="lazy"
            />
          </div>
          <p className={styles.visualCaption}>Inside MakeChurchEazy · Media in OBS Studio</p>
        </div>
    </FeatureShowcase>
  );
}
