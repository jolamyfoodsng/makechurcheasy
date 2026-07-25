import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, Music, Film, Brain, Zap } from "lucide-react";
import { FeatureItem } from "../types";

interface StepFeaturesProps {
  onNext: () => void;
  onBack: () => void;
}

const featuresList: FeatureItem[] = [
  {
    id: "bible",
    title: "Bible",
    description: "Display scriptures beautifully in your services and livestreams.",
    iconName: "bible",
    colorClass: "bg-purple-50 group-hover:bg-purple-100",
    textColorClass: "text-primary-brand"
  },
  {
    id: "worship",
    title: "Worship",
    description: "Manage songs, lyrics, and worship presentations with ease.",
    iconName: "worship",
    colorClass: "bg-emerald-50 group-hover:bg-emerald-100",
    textColorClass: "text-secondary-brand-dark"
  },
  {
    id: "media",
    title: "Media",
    description: "Images, videos, announcements, and graphics for every occasion.",
    iconName: "media",
    colorClass: "bg-amber-50 group-hover:bg-amber-100",
    textColorClass: "text-amber-600"
  },
  {
    id: "ai",
    title: "AI Tools",
    description: "Transcription, translation, sermon notes, and more with AI.",
    iconName: "ai",
    colorClass: "bg-indigo-50 group-hover:bg-indigo-100",
    textColorClass: "text-[#5300b9]"
  }
];

export default function StepFeatures({ onNext, onBack }: StepFeaturesProps) {
  const renderIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case "bible":
        return <BookOpen className={className} />;
      case "worship":
        return <Music className={className} />;
      case "media":
        return <Film className={className} />;
      case "ai":
        return <Brain className={className} />;
      default:
        return <Zap className={className} />;
    }
  };

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
            strokeDashoffset="94.2" // 25% complete (2/4 indicator)
            strokeWidth="3.5"
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <span className="absolute text-[11px] font-bold text-primary-brand font-mono">
          2/4
        </span>
      </div>

      {/* Main Content Inner Padding */}
      <div className="p-8 md:p-10 flex flex-col h-full">
        {/* Branding Header Tag */}
        <div className="flex items-center gap-2 mb-6">
          <Zap className="text-primary-brand w-5 h-5 fill-primary-brand/10" />
          <span className="font-display font-bold text-xs text-primary-brand uppercase tracking-[0.12em]">
            Features
          </span>
        </div>

        {/* Title & Sub-header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-3">
            Everything you need, in one place
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Discover the powerful tools built specifically to streamline your ministry and engage your congregation.
          </p>
        </div>

        {/* Features Interactive Stack */}
        <div className="space-y-3 mb-8">
          {featuresList.map((feature, idx) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.3 }}
              className="flex items-start gap-4 p-4 rounded-xl border border-gray-50 bg-[#F9FAFB]/60 hover:bg-white hover:border-gray-100/90 hover:shadow-sm cursor-default group transition-all duration-200"
            >
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-all duration-200 ${feature.colorClass}`}
              >
                {renderIcon(feature.iconName, `w-5 h-5 ${feature.textColorClass}`)}
              </div>
              <div className="space-y-0.5">
                <h3 className="font-display font-semibold text-sm text-gray-800">
                  {feature.title}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed font-sans">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer Navigation Panel */}
        <div className="flex items-center justify-between pt-5 border-t border-gray-100 mt-auto">
          {/* Back Action */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 font-semibold text-xs text-gray-500 hover:text-primary-brand transition-colors group cursor-pointer py-1"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Back
          </button>

          {/* Dots Indicators */}
          <div className="flex gap-1.5 items-center">
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-5 h-2 rounded-full bg-primary-brand" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
          </div>

          {/* Next Action */}
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
