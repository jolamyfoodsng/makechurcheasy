import { BookOpen, Check, Mic, Timer } from "lucide-react";
import type { PresentationFeature } from "./feature-content";
import styles from "./homepage.module.css";

export default function FeatureVisual({ feature, priority = false }: { feature: PresentationFeature; priority?: boolean }) {
  const dimensions: Record<string, [number, number]> = { bible: [1280, 720], worship: [1199, 768], "lower-thirds": [1280, 720], media: [1198, 768], multiview: [1198, 768] };
  const [width, height] = dimensions[feature.id] || [1280, 720];
  if (feature.image) return <img src={`/homepage/${feature.image}.webp`} alt={feature.alt} width={width} height={height} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} />;
  if (feature.id === "voice-bible") return <div className={styles.voiceArtwork} role="img" aria-label={feature.alt}>
    <div className={styles.voiceTop}><Mic size={20} /><span>SPEECH + SCRIPTURE</span><span className={styles.exampleLabel}>EXAMPLE</span></div>
    <div className={styles.voiceWave} aria-hidden="true">{Array.from({ length: 39 }, (_, i) => <i key={i} style={{ height: `${12 + ((i * 17 + i * i * 7) % 53)}px` }} />)}</div>
    <div className={styles.spokenWords}>“John chapter three,<br />verse sixteen.”</div>
    <div className={styles.scriptureSuggestion}><div><BookOpen size={19} /><strong>John 3:16</strong><span>KJV</span></div><p>For God so loved the world, that he gave his only begotten Son…</p><span className={styles.readyLabel}><Check size={14} /> Ready to review and present</span></div>
  </div>;
  return <div className={styles.countdownExample} role="img" aria-label={feature.alt}>
    <Timer size={28} /><span>PRE-SERVICE COUNTDOWN</span><strong>15:00</strong><p>A clear start. A ready team.</p>
    <div><span>Worship set <b>05:00</b></span><span>Sermon start <b>10:00</b></span></div>
    <small>Welcome. We’re glad you’re here.</small>
  </div>;
}
