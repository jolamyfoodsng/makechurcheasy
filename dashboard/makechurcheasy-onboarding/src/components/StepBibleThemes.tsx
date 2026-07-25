import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Palette, Paintbrush, Layout, Play } from "lucide-react";

interface StepBibleThemesProps {
  onNext: () => void;
  onBack: () => void;
}

const highlights = [
  {
    icon: Palette,
    title: "Built-in Themes",
    description: "Start with professionally designed themes for both fullscreen and lower-third overlays.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Paintbrush,
    title: "Custom Theme Editor",
    description: "Full visual editor for fonts, colors, backgrounds, animations, and logo placement.",
    color: "bg-sky-50 text-sky-600",
  },
  {
    icon: Layout,
    title: "Background Options",
    description: "Solid colors, gradients, custom images, or videos — with opacity and shade overlays.",
    color: "bg-cyan-50 text-cyan-600",
  },
  {
    icon: Play,
    title: "Animations",
    description: "Choose from fade, slide-up, scale-in, and reveal animations with duration control.",
    color: "bg-teal-50 text-teal-600",
  },
];

export default function StepBibleThemes({ onNext, onBack }: StepBibleThemesProps) {
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
            strokeDashoffset="62.8"
            strokeWidth="3.5"
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <span className="absolute text-[11px] font-bold text-primary-brand font-mono">
          4/8
        </span>
      </div>

      {/* Main Content Inner Padding */}
      <div className="p-8 md:p-10 flex flex-col h-full">
        {/* Branding Header Tag */}
        <div className="flex items-center gap-2 mb-6">
          <Palette className="text-primary-brand w-5 h-5 fill-primary-brand/10" />
          <span className="font-display font-bold text-xs text-primary-brand uppercase tracking-[0.12em]">
            Bible Feature
          </span>
        </div>

        {/* Title & Sub-header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-3">
            Overlay Themes
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Make scripture look stunning with built-in themes or create your own with the visual theme editor.
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
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-5 h-2 rounded-full bg-primary-brand" />
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
