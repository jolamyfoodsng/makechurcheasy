import { motion } from "motion/react";
import { CheckCircle, Sliders, Presentation, Play, Music, Megaphone, Brain, RefreshCw, Layers, LayoutGrid, Check } from "lucide-react";
import { ChurchProfile, ChurchBranding } from "../types";

interface StepDashboardProps {
  profile: ChurchProfile;
  branding: ChurchBranding;
  onReset: () => void;
}

export default function StepDashboard({
  profile,
  branding,
  onReset,
}: StepDashboardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-4xl bg-white rounded-3xl shadow-[0_15px_50px_rgba(108,43,217,0.06)] border border-gray-100 overflow-hidden"
    >
      {/* Top Hero Accent Bar of selected primary color */}
      <div
        className="h-3 w-full"
        style={{ backgroundColor: branding.primaryColor }}
      />

      <div className="p-8 md:p-12">
        {/* Dynamic Success Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-gray-100 mb-8">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-sm flex items-center justify-center flex-shrink-0 border"
              style={{
                backgroundColor: `${branding.primaryColor}10`,
                borderColor: `${branding.primaryColor}20`
              }}
            >
              <CheckCircle className="w-7 h-7" style={{ color: branding.primaryColor }} />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-green-600 block mb-0.5">
                Onboarding Successful • Gracefully Ready
              </span>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-900 tracking-tight leading-tight">
                {profile.name || "Your Church Space"}
              </h1>
            </div>
          </div>

          {/* Preset Pill Badge */}
          <div className="flex items-center gap-1.5 self-start md:self-center">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: branding.secondaryColor }} />
            <span className="text-xs font-semibold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
              {profile.size} members
            </span>
          </div>
        </div>

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Column: Color palette & System overview */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-gray-50 rounded-sm p-5 border border-gray-100 space-y-4">
              <h2 className="font-display font-bold text-sm text-gray-800 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-gray-500" />
                Active Branding
              </h2>

              {/* Verified colors */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 py-1.5 bg-white rounded-xl border border-gray-100 text-xs">
                  <span className="text-gray-500 font-medium">Primary</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-gray-400">{branding.primaryColor}</span>
                    <span className="w-5 h-5 rounded-full border shadow-sm" style={{ backgroundColor: branding.primaryColor }} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 py-1.5 bg-white rounded-xl border border-gray-100 text-xs">
                  <span className="text-gray-500 font-medium">Secondary</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-gray-400">{branding.secondaryColor}</span>
                    <span className="w-5 h-5 rounded-full border shadow-sm" style={{ backgroundColor: branding.secondaryColor }} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 py-1.5 bg-white rounded-xl border border-gray-100 text-xs">
                  <span className="text-gray-500 font-medium">Accent</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-gray-400">{branding.accentColor}</span>
                    <span className="w-5 h-5 rounded-full border shadow-sm" style={{ backgroundColor: branding.accentColor }} />
                  </div>
                </div>
              </div>

              {/* Logo detail view */}
              <div className="p-3 bg-white rounded-xl border border-gray-100 flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg border border-gray-50 bg-[#F9FAFB] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {branding.logoDataUrl ? (
                    <img src={branding.logoDataUrl} alt="Church Logo" className="w-full h-full object-contain p-0.5" />
                  ) : (
                    <Sliders className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">Workspace Emblem</p>
                  <p className="text-[10px] text-gray-400 truncate font-sans">
                    {branding.uploadedLogoName || "Configured default branding"}
                  </p>
                </div>
              </div>
            </div>

            {/* Micro-profile checklist */}
            <div className="bg-gray-50 rounded-sm p-5 border border-gray-100 text-xs leading-relaxed space-y-3">
              <h3 className="font-display font-bold text-gray-800">Workspace Locale Settings</h3>
              <div className="space-y-2 text-gray-500">
                <p><strong>Website:</strong> {profile.website || "No link added"}</p>
                <p><strong>Country:</strong> {profile.country}</p>
                <p><strong>Timezone:</strong> {profile.timezone}</p>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive quick tasks with branding preview */}
          <div className="lg:col-span-8 space-y-6">

            {/* Direct graphics previews showing off custom colors */}
            <div className="bg-gradient-to-tr from-gray-50 to-gray-50/20 rounded-sm p-6 border border-gray-100">
              <h3 className="font-display font-semibold text-xs text-gray-400 uppercase tracking-widest mb-4">
                Dynamic Graphic Generator Preview
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Scripture Overlay */}
                <div className="p-4 bg-gray-900 rounded-xl border border-gray-800 flex flex-col justify-between aspect-video relative overflow-hidden group">
                  <span className="text-[10px] font-bold text-gray-500">Live Overlay Preview</span>
                  <div
                    className="p-2.5 rounded-lg border bg-black/60 backdrop-blur-sm shadow-xl"
                    style={{ borderLeftWidth: "3px", borderLeftColor: branding.primaryColor }}
                  >
                    <p className="text-[10px] text-white font-medium leading-relaxed font-serif">
                      "I can do all things through Christ who strengthens me."
                    </p>
                    <p className="text-[8px] text-right font-semibold mt-1" style={{ color: branding.secondaryColor }}>
                      Philippians 4:13
                    </p>
                  </div>
                </div>

                {/* Announcement slide */}
                <div
                  className="p-4 rounded-xl shadow-lg border relative flex flex-col justify-between aspect-video"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.primaryColor}dd)`,
                    borderColor: branding.primaryColor
                  }}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-bold text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
                      Announcement
                    </span>
                    <Megaphone className="w-4 h-4" style={{ color: branding.accentColor }} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white font-display">Sunday Service Kickoff</h4>
                    <p className="text-[9px] text-white/80 font-sans leading-normal">
                      Join us offline or online for study.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Helpful core options list */}
            <div className="space-y-3">
              <h3 className="font-display font-bold text-sm text-gray-800">Next Steps</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Action 1 */}
                <div
                  className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 bg-white hover:shadow-sm cursor-pointer transition-all flex items-center gap-3 group"
                  onClick={() => alert("Launching presentation layout editor...")}
                >
                  <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 group-hover:scale-105 transition-all">
                    <Presentation className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-800">Launch Sermon Presenter</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5 font-sans">Create modern slide themes.</p>
                  </div>
                </div>

                {/* Action 2 */}
                <div
                  className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 bg-white hover:shadow-sm cursor-pointer transition-all flex items-center gap-3 group"
                  onClick={() => alert("Connecting streaming feed with selected overlays...")}
                >
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 group-hover:scale-105 transition-all">
                    <Play className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-800">Configure Live Stream</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5 font-sans">Simulcast overlay lower thirds.</p>
                  </div>
                </div>

                {/* Action 3 */}
                <div
                  className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 bg-white hover:shadow-sm cursor-pointer transition-all flex items-center gap-3 group"
                  onClick={() => alert("Generating sermon notes with integrated AI...")}
                >
                  <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-100 group-hover:scale-105 transition-all">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-800">AI Sermon Notes Assistant</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5 font-sans">Transcribe or summarize audio with AI.</p>
                  </div>
                </div>

                {/* Action 4 */}
                <div
                  className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 bg-white hover:shadow-sm cursor-pointer transition-all flex items-center gap-3 group"
                  onClick={() => alert("Arranging songs...")}
                >
                  <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-100 group-hover:scale-105 transition-all">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-800">Worship Song Builder</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5 font-sans">Manage custom hymns or choruses.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Admin Controls below the layout */}
        <div className="mt-10 pt-6 border-t border-gray-100 flex justify-between items-center text-xs">
          <p className="text-gray-400 italic font-sans">Setup and Branding fully stored locally.</p>
          <button
            onClick={onReset}
            className="flex items-center gap-1 bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 px-4 py-2.5 rounded-xl font-semibold hover:border-gray-300 transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Setup Flow
          </button>
        </div>
      </div>
    </motion.div>
  );
}
