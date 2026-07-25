import {
    ArrowLeft, ArrowRight,
    BookOpen,
    Brain,
    Film,
    Music
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactElement } from "react";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import aiToolsGif from "../assets/ai-tools.gif";
import bibleOnboardingGif from "../assets/bible-onboarding.gif";
import mediaOnboardingGif from "../assets/media-onboarding.gif";
import worshipOnboardingGif from "../assets/worship-onboarding.gif";

type FeaturePage = {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    icon: ReactElement;
    colorClass: string;
    bgLightClass: string;
    widget: ReactElement;
};

function BibleWidget() {
    return <Zoom>
        <img src={bibleOnboardingGif.src} alt="Bible Background" className="inset-0 w-full h-full object-cover object-left lg:object-center" />
    </Zoom>
}

/**
 * 3.2 WORSHIP LYRICS WIDGET MODULE
 */
function WorshipWidget() {
    return <Zoom>
        <img src={worshipOnboardingGif.src} alt="Worship Background" className="inset-0 w-full h-full object-cover object-left lg:object-center" />
    </Zoom>
}

/**
 * 3.3 MEDIA COMPONENT WIDGET
 */
function MediaWidget() {
    return <Zoom>
        <img src={mediaOnboardingGif.src} alt="Media Background" className="inset-0 w-full h-full object-cover object-left lg:object-center" />
    </Zoom>
}

/**
 * 3.4 COGNITIVE AI TOOLS WIDGET MODULE
 */
function AIToolsWidget() {
    return <Zoom>
        <img src={aiToolsGif.src} alt="AI Tools Background" className="inset-0 w-full h-full object-cover object-left lg:object-center" />
    </Zoom>
}

/* ==========================================================================
   4. NAMED EXPORTS (for use in onboarding steps)
   ========================================================================== */
export { AIToolsWidget, BibleWidget, MediaWidget, WorshipWidget };

/* ==========================================================================
   5. PRIMARY EXPORTED APP MODULE (WIDGET PRESENTATION PORTAL)
   ========================================================================== */
export default function App() {
    const [currentPageIdx, setCurrentPageIdx] = useState(0);

    const pages: FeaturePage[] = [
        {
            id: "bible",
            title: "Bible",
            subtitle: "DISPLAY SCRIPTURES INSIDE OBS",
            description:
                "Search, display, and broadcast scriptures beautifully during services and livestreams. Instantly switch between Bible versions and send verses directly to OBS with a single click.",
            icon: <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />,
            colorClass: "text-indigo-600 bg-indigo-50 border-indigo-100",
            bgLightClass: "from-indigo-500/5 via-purple-500/5",
            widget: <BibleWidget />,
        },

        {
            id: "worship",
            title: "Worship",
            subtitle: "PRESENT SONG LYRICS WITH EASE",
            description:
                "Organize worship songs, project lyrics beautifully, and keep your entire worship presentation ready for every service without switching between multiple tools.",
            icon: <Music className="w-5 h-5 sm:w-6 sm:h-6" />,
            colorClass: "text-emerald-600 bg-emerald-50 border-emerald-100",
            bgLightClass: "from-emerald-500/5 via-teal-500/5",
            widget: <WorshipWidget />,
        },

        {
            id: "media",
            title: "Media",
            subtitle: "MANAGE IMAGES, VIDEOS & ANNOUNCEMENTS",
            description:
                "Keep every announcement, sermon graphic, countdown, image, and video organized and ready to push into OBS whenever you need it.",
            icon: <Film className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />,
            colorClass: "text-amber-600 bg-amber-50 border-amber-100",
            bgLightClass: "from-amber-500/5 via-orange-500/5",
            widget: <MediaWidget />,
        },

        {
            id: "aitools",
            title: "AI Tools",
            subtitle: "TRANSCRIBE, TRANSLATE & SUMMARIZE",
            description:
                "Turn sermons into transcripts, translate messages into multiple languages, generate AI summaries, and help your congregation engage beyond the service.",
            icon: <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-violet-500" />,
            colorClass: "text-violet-600 bg-violet-50 border-violet-100",
            bgLightClass: "from-violet-500/5 via-indigo-500/5",
            widget: <AIToolsWidget />,
        },
    ];

    const currentPage = pages[currentPageIdx];

    const handleNext = () => {
        if (currentPageIdx < pages.length - 1) {
            setCurrentPageIdx(currentPageIdx + 1);
        } else {
            setCurrentPageIdx(0);
        }
    };

    const handlePrev = () => {
        if (currentPageIdx > 0) {
            setCurrentPageIdx(currentPageIdx - 1);
        }
    };

    return (
        <div className="min-h-screen bg-[#f1f3f9] text-slate-900 flex flex-col justify-start items-center p-3 sm:p-6 md:p-8 selection:bg-indigo-500/10 select-none">

            {/* Background ambient visuals */}
            <div className={`absolute top-0 right-0 w-[40rem] h-[40rem] bg-gradient-to-br ${currentPage.bgLightClass} rounded-full blur-[100px] pointer-events-none -mr-40 -mt-40 z-0 transition-all duration-700`} />
            <div className="absolute bottom-0 left-0 w-[35rem] h-[35rem] bg-gradient-to-tr from-slate-200/20 to-indigo-100/10 rounded-full blur-[90px] pointer-events-none -ml-30 -mb-30 z-0" />

            {/* Main container */}
            <div className="w-full max-w-[1000px] z-10">

                <div className="bg-white rounded-[2.5rem] p-5 sm:p-8 md:p-12 shadow-[0_15px_50px_-15px_rgba(99,102,241,0.06)] border border-slate-100/80 flex flex-col justify-between">

                    {/* Section Indicator Bar (Upper layout row) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-8">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-indigo-600 uppercase">
                                Ministry Platform Onboarding
                            </span>
                        </div>

                        {/* Segmented indicators switcher circles */}
                        <div className="flex items-center gap-1.5 self-start sm:self-center">
                            {pages.map((p, idx) => {
                                const isActive = idx === currentPageIdx;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => setCurrentPageIdx(idx)}
                                        className={`h-2.5 rounded-full transition-all duration-300 ${isActive ? "w-8 bg-indigo-600" : "w-2.5 bg-slate-200 hover:bg-slate-300"
                                            }`}
                                        title={`View ${p.title} feature`}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Dynamic Content Frame workspace */}
                    <div className="flex-1 min-h-[380px] sm:min-h-[420px] flex flex-col justify-between">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentPage.id}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                className="flex flex-col space-y-8"
                            >

                                {/* Descriptive center stack */}
                                <div className="text-center max-w-[620px] mx-auto space-y-3.5">
                                    <span className="text-[10px] sm:text-11px font-mono font-bold tracking-[0.18em] text-slate-400 block uppercase">
                                        {currentPage.subtitle}
                                    </span>
                                    <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display text-slate-900 leading-none">
                                        {currentPage.title}
                                    </h2>
                                    <p className="text-slate-500 text-sm sm:text-md leading-relaxed pr-1 font-sans">
                                        {currentPage.description}
                                    </p>
                                </div>

                                {/* Big Centered Projection Mockup Screen (The Interactive Module Widget) */}
                                <div className="w-full h-auto flex justify-center items-center">
                                    <div className="w-full max-w-full bg-slate-50/50 p-2 sm:p-3.5 rounded-[2.5rem] border border-slate-100 shadow-sm hover:border-slate-250/60 transition-colors">
                                        {currentPage.widget}
                                    </div>
                                </div>

                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Page Controls Navigation Footer */}
                    <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-8">
                        <button
                            onClick={handlePrev}
                            disabled={currentPageIdx === 0}
                            className={`flex items-center gap-1.5 text-xs sm:text-sm font-semibold p-2.5 rounded-xl transition-all ${currentPageIdx === 0
                                ? "text-slate-300 cursor-not-allowed opacity-40"
                                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                                }`}
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </button>

                        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono font-bold text-slate-400">
                            <span className="text-indigo-600 uppercase">Page {currentPageIdx + 1} of {pages.length}</span>
                            <span>•</span>
                            <span className="capitalize">{currentPage.id} Focus View</span>
                        </div>

                        <button
                            onClick={handleNext}
                            className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-850 text-white text-xs sm:text-sm font-bold flex items-center gap-2 py-3 px-6 rounded-sm shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/15 group transition-all"
                        >
                            {currentPageIdx === pages.length - 1 ? "Restart Onboarding" : "Next: " + pages[currentPageIdx + 1].title}
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>

                </div>

            </div>

            {/* Footer copyright */}
            <div className="mt-8 text-[11px] font-mono text-slate-400 select-none tracking-wide z-10 transition-colors">
                <span>© 2026 Ministry Studio. All Rights Reserved.</span>
            </div>
        </div>
    );
}
