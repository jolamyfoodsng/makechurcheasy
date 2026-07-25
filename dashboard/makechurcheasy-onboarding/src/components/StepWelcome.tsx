import { motion } from "motion/react";
import { ArrowRight, Clock, Church, Zap, MessageSquareHeart } from "lucide-react";

interface StepWelcomeProps {
  onNext: () => void;
  onSkip: () => void;
}

export default function StepWelcome({ onNext, onSkip }: StepWelcomeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative w-full max-w-[480px] bg-white rounded-sm shadow-[0_10px_35px_rgba(108,43,217,0.05)] border border-gray-100 overflow-hidden"
    >
      {/* Dynamic Progress Circle (Fixed Top Right) */}
      <div className="absolute top-6 right-6 w-11 h-11 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <circle
            className="stroke-gray-100"
            cx="18"
            cy="18"
            fill="none"
            r="16"
            strokeWidth="3"
          />
          <circle
            className="stroke-primary-brand"
            cx="18"
            cy="18"
            fill="none"
            r="16"
            strokeWidth="3"
            strokeDasharray="10, 100"
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-primary-brand">
          10%
        </div>
      </div>

      {/* Main Container Padding */}
      <div className="p-8 md:p-10 flex flex-col items-center text-center">
        {/* Decorative Brand Header Sub-mark */}
        <div className="flex items-center justify-center gap-2 mb-8 mt-2">
          <Church className="text-primary-brand w-8 h-8 stroke-[2]" />
          <span className="font-display text-xl font-bold text-gray-800">
            MakeChurchEasy
          </span>
        </div>

        {/* Welcome Illustration Area with confetti & pulse layers */}
        <div className="mb-8 relative w-48 h-48 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 bg-primary-brand/5 rounded-full scale-110 animate-pulse duration-3000" />

          {/* Main 3D Church Graphic */}
          {/* <div className="relative z-10 animate-floating">
            <img
              className="w-40 h-40 object-contain drop-shadow-xl"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAQTWuYb67Eco8uJ4SOrZLTkvqeJwHMxnj1snEcFAXIm-MIB3cAU95LtLGcNcErQphNKp3gMmBQgaMUje0xjomA93xanhFekUcT-uvMnjihwUDUG9rDVKyaFtBjQZG11_p-xDy49f3Q-lgUJGZEkY6oput8O8G6F6nottrGxmVuLGxUpwHQ2ejGl_vx4SkR0eg5jNGFl5NXp0_xKVRtWogkxrvVV1bLhmDlpiJgs-PDmKYtbEt0iH24bodF0SqjWvO30DGQXGglE7fd"
              alt="MakeChurchEasy Illustration"
              referrerPolicy="no-referrer"
            />
          </div> */}

          {/* Micro-interactive floating accents */}
          <motion.div
            animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
            transition={{ repeat: Infinity, duration: 4 }}
            className="absolute -top-1 -right-3 text-secondary-brand drop-shadow"
          >
            <Zap className="w-6 h-6" />
          </motion.div>

          <motion.div
            animate={{ scale: [1, 0.9, 1.1, 1], y: [0, -3, 3, 0] }}
            transition={{ repeat: Infinity, duration: 5 }}
            className="absolute -bottom-1 -left-3 text-primary-brand/35"
          >
            <MessageSquareHeart className="w-6 h-6" />
          </motion.div>
        </div>

        {/* Welcome Text Content */}
        <div className="space-y-3 mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-gray-900 leading-tight">
            Welcome to <br />
            <span className="text-primary-brand">MakeChurchEasy!</span>
          </h1>
          <p className="text-gray-500 text-sm md:text-base max-w-[340px] mx-auto leading-relaxed">
            All the tools your church needs to create powerful presentations, engage your congregation, and share the message.
          </p>
        </div>

        {/* Estimated Time Indicator */}
        <div className="flex items-center gap-2 text-gray-400 font-sans text-xs mb-8 bg-gray-50 px-3.5 py-1.5 rounded-full border border-gray-100">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-gray-500">This takes about 2 minutes</span>
        </div>

        {/* Form Actions */}
        <div className="w-full space-y-3">
          <button
            onClick={onNext}
            className="w-full bg-primary-brand text-white py-3.5 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 group transition-all hover:bg-primary-container hover:shadow-lg hover:shadow-primary-brand/20 active:scale-98 cursor-pointer"
          >
            Start Setup
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            onClick={onSkip}
            className="w-full text-gray-500 hover:text-primary-brand font-medium text-sm transition-colors py-2 active:opacity-70 cursor-pointer"
          >
            Skip Setup
          </button>
        </div>
      </div>

      {/* Progress Footer Indicators */}
      <div className="pb-6 flex justify-center gap-2">
        <span className="w-6 h-2 rounded-full bg-primary-brand transition-all" />
        <span className="w-2 h-2 rounded-full bg-gray-200 transition-all" />
        <span className="w-2 h-2 rounded-full bg-gray-200 transition-all" />
        <span className="w-2 h-2 rounded-full bg-gray-200 transition-all" />
        <span className="w-2 h-2 rounded-full bg-gray-200 transition-all" />
        <span className="w-2 h-2 rounded-full bg-gray-200 transition-all" />
        <span className="w-2 h-2 rounded-full bg-gray-200 transition-all" />
        <span className="w-2 h-2 rounded-full bg-gray-200 transition-all" />
      </div>
    </motion.div>
  );
}
