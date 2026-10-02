import { BookOpen, Columns2, Globe2, Search, Radio, Settings2, Music2, ListMusic, Monitor, Type, Palette, UserRound, Megaphone, Timer, Clock3, LayoutPanelTop, Layers, PictureInPicture2 } from "lucide-react";
import FeatureShowcase from "./feature-showcase";
import FeatureVisual from "./feature-visual";
import { presentationFeatures } from "./feature-content";
import MediaBesideObsShowcase from "./media-beside-obs-showcase";
import styles from "./media-beside-obs-showcase.module.css";

function BibleVisual() {
  return (
    <div className={styles.visual}>
      <div className={styles.screenshotStage}>
        <img
          src="/homepage/bible-obs-live.webp"
          alt="MakeChurchEazy Bible dock inside OBS Studio with 2 Corinthians 4:2 live on preview and program output"
          width={1024}
          height={640}
          loading="lazy"
        />
      </div>
      <p className={styles.visualCaption}>Inside MakeChurchEazy · Bible in OBS Studio</p>
    </div>
  );
}

const supportingFeatures = [
  {
    id: "worship", eyebrow: "Worship lyrics in OBS", lead: "Keep every lyric ready.", emphasis: "Follow every moment of worship.",
    description: ["Prepare and present worship lyrics from the MakeChurchEazy dock in OBS Studio. Keep your songs in one library, arrange lyric slides before the service, and select the verse or chorus you need as the worship team sings.", "Display lyrics full screen for the room or as a lower third over your livestream video. Move between songs, Bible verses, and the rest of your service from the same workspace."],
    benefits: [{ icon: Music2, text: "Keep songs together in your worship library" }, { icon: ListMusic, text: "Prepare and arrange lyric slides ahead of time" }, { icon: Monitor, text: "Choose full-screen or lower-third lyrics" }, { icon: BookOpen, text: "Move between lyrics and scripture inside OBS" }],
    microcopy: "Your song library, ready for Sunday.", linkLabel: "Explore worship lyrics",
  },
  {
    id: "lower-thirds", eyebrow: "Lower thirds in OBS", lead: "Give every speaker", emphasis: "a clear introduction.",
    description: ["Show a pastor’s name, a guest speaker’s title, or a church announcement over your OBS video. MakeChurchEazy keeps your lower-third text and theme controls together in the dock, ready for the next moment in the service.", "Choose a design, add the details, and display the lower third when the speaker begins. Keep the camera feed visible behind the text, then clear the introduction when it has done its job."],
    benefits: [{ icon: UserRound, text: "Introduce pastors and guest speakers by name" }, { icon: Type, text: "Add titles and short announcements" }, { icon: Palette, text: "Choose from the available lower-third themes" }, { icon: Monitor, text: "Keep the speaker visible behind the overlay" }],
    microcopy: "The right details, on screen at the right time.", linkLabel: "Explore lower thirds",
  },
  {
    id: "countdowns", eyebrow: "Tickers & countdowns in OBS", lead: "Keep the service on time.", emphasis: "Keep everyone informed.",
    description: ["Prepare a countdown before worship begins, display a timer or clock, and share a welcome message or announcement with a scrolling ticker. MakeChurchEazy brings these service timing and announcement tools into your OBS workflow.", "Choose the timing you need and prepare your message before the service. Manage what appears on screen from the dock as your team moves from the welcome to worship and the sermon."],
    benefits: [{ icon: Timer, text: "Prepare a countdown for the start of your service" }, { icon: Clock3, text: "Display timers and clocks" }, { icon: Megaphone, text: "Share welcome messages and announcement tickers" }, { icon: Settings2, text: "Manage timing and messages from the OBS dock" }],
    microcopy: "A clear start. A ready team. An informed congregation.", linkLabel: "Explore tickers & countdowns",
  },
  {
    id: "multiview", eyebrow: "Multi-view layouts in OBS", lead: "Bring your camera and content", emphasis: "together on one screen.",
    description: ["Build a church broadcast layout around your OBS scenes, scripture, media, and overlays. MakeChurchEazy’s multi-view tools let you choose an arrangement and assign the content you want viewers to see together.", "Use a split-screen or picture-in-picture layout when the service needs more than one view. Prepare the composition, review its sources in OBS, and present it when the moment arrives."],
    benefits: [{ icon: LayoutPanelTop, text: "Choose from the available layout library" }, { icon: Columns2, text: "Arrange content in a split-screen view" }, { icon: PictureInPicture2, text: "Use picture in picture for a second view" }, { icon: Layers, text: "Combine existing OBS scenes and sources" }],
    microcopy: "Choose the arrangement. Add your content. Present the full picture.", linkLabel: "Explore multi-view",
  },
];

export default function HomepageFeatureShowcases() {
  return <>
    <FeatureShowcase
      id="bible" eyebrow="Bible verses & translations in OBS"
      heading={<>Find every passage.<br /><span>Keep it live inside OBS.</span></>}
      description={[
        "Find and present Bible verses without leaving OBS Studio. MakeChurchEazy keeps scripture search, verse comparison, and translation comparison together in your Bible dock. Explore 10,000+ Bible translations, compare passages, and show the same verse in different translations side by side.",
        "Follow the message as it unfolds: select another verse and update the displayed scripture in real time. Present it full screen or as a lower third while MakeChurchEazy creates and updates the required OBS scenes and sources automatically on paid plans.",
      ]}
      benefits={[
        { icon: Search, text: "Explore 10,000+ Bible translations" },
        { icon: Columns2, text: "Compare Bible passages and translations side by side" },
        { icon: Radio, text: "Update the displayed verse in real time" },
        { icon: Monitor, text: "Choose full-screen scripture or a lower third" },
        { icon: Settings2, text: "Stay in OBS with automatic scene and source updates" },
      ]}
      microcopy="Stay with the message. Your Bible tools are right beside you."
      href="/features/bible" linkLabel="Explore Bible presentation"
    ><BibleVisual /></FeatureShowcase>
    {supportingFeatures.map((content) => {
      const feature = presentationFeatures.find(item => item.id === content.id)!;
      return <div key={content.id}>
        {content.id === "countdowns" && <MediaBesideObsShowcase />}
        <FeatureShowcase id={content.id} eyebrow={content.eyebrow} heading={<>{content.lead} <span>{content.emphasis}</span></>} description={content.description} benefits={content.benefits} microcopy={content.microcopy} href={`/features/${content.id}`} linkLabel={content.linkLabel} reverse={false}>
          <div className={styles.visual}><div className={styles.screenshotStage}><FeatureVisual feature={feature} /></div><p className={styles.visualCaption}>{feature.image ? `Inside MakeChurchEazy · ${feature.label}` : "Illustrative countdown workflow"}</p></div>
        </FeatureShowcase>
      </div>;
    })}
  </>;
}
