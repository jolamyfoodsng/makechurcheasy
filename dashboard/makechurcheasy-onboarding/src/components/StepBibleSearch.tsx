import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Search, Zap, Command, History } from "lucide-react";

interface StepBibleSearchProps {
  onNext: () => void;
  onBack: () => void;
}

const highlights = [
  {
    icon: Command,
    title: "Quick Search (Cmd+K)",
    description: "Spotlight-style search bar. Type a reference like \"j316\" or \"Gen 1:1\" and jump instantly.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: Search,
    title: "Keyword Search",
    description: "Full-text search across all verses. Find passages by words, phrases, or themes.",
    color: "bg-teal-50 text-teal-600",
  },
  {
    icon: Zap,
    title: "AI-Powered Matching",
    description: "Semantic search with embedding-based matching. Find the right verse even with imprecise queries.",
    color: "bg-cyan-50 text-cyan-600",
  },
  {
    icon: History,
    title: "Recent Searches",
    description: "Your last 4 searches are saved for quick access. Pick up right where you left off.",
    color: "bg-green-50 text-green-600",
  },
];

export default function StepBibleSearch({ onNext, onBack }: StepBibleSearchProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4 }}
      className="relative w-full max-w-[480px] bg-white rounded-sm shadow-[0_10px_35px_rgba(108,43,217,0.05)] border border-gray-100 overflow-hidden"
    >
      {/* Progress ring tracker (Top Right) */}
      <div className="absolute top-8 right-8 flex items-center justify-center w-12 h-12">
        <svg className="w-full h-full -rotate-90">
          <circle
            className="text-gray-100"
            cx="24"
            cy="24"
            fill="transparent"
            r="20"
            stroke="currentColor"
            strokeWidth="3.5"
          />
          <circle
            className="text-primary-brand"
            cx="24"
            cy="24"
            fill="transparent"
            r="20"
            stroke="currentColor"
            strokeDasharray="125.6"
            strokeDashoffset="94.2"
            strokeWidth="3.5"
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <span className="absolute text-[11px] font-bold text-primary-brand font-mono">
          2/8
        </span>
      </div>

      {/* Main Content Inner Padding */}
      <div className="p-8 md:p-10 flex flex-col h-full">
        {/* Branding Header Tag */}
        <div className="flex items-center gap-2 mb-6">
          <Search className="text-primary-brand w-5 h-5 fill-primary-brand/10" />
          <span className="font-display font-bold text-xs text-primary-brand uppercase tracking-[0.12em]">
            Bible Feature
          </span>
        </div>

        {/* Title & Sub-header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-3">
            Smart Verse Search
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Find any verse instantly with fuzzy reference parsing, keyword search, and AI-powered matching.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="space-y-3 mb-8">
          {highlights.map((item, idx) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.3 }}
              className="flex items-start gap-4 p-4 rounded-xl border border-gray-50 bg-[#F9FAFB]/60 hover:bg-white hover:border-gray-100/90 hover:shadow-sm cursor-default group transition-all duration-200"
            >
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-all duration-200 ${item.color}`}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-display font-semibold text-sm text-gray-800">
                  {item.title}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed font-sans">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer Navigation Panel */}
        <div className="flex items-center justify-between pt-5 border-t border-gray-100 mt-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 font-semibold text-xs text-gray-500 hover:text-primary-brand transition-colors group cursor-pointer py-1"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Back
          </button>

          <div className="flex gap-1.5 items-center">
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-5 h-2 rounded-full bg-primary-brand" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
          </div>

          <button
            onClick={onNext}
            className="bg-primary-brand text-white px-5 py-3.5 rounded-xl font-semibold text-xs shadow-md hover:bg-primary-brand-dark hover:shadow-primary-brand/20 transition-all cursor-pointer active:scale-97 flex items-center gap-1.5 group"
          >
            Next
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
