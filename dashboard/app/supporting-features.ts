import { BookOpen, Clock3, Columns2, Layers, LayoutPanelTop, ListMusic, Megaphone, Monitor, Music2, Palette, PictureInPicture2, Settings2, Timer, Type, UserRound } from "lucide-react";

/** Worship, lower thirds, tickers & countdowns and multi-view: the home page's tabbed feature section. */
export const supportingFeatures = [
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
