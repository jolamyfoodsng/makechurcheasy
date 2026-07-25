import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Church, Globe, Image, Save } from "lucide-react";
import { ChurchProfile, ChurchBranding } from "../types";

interface StepProfileProps {
  profile: ChurchProfile;
  branding: ChurchBranding;
  onChangeProfile: (updatedProfile: Partial<ChurchProfile>) => void;
  onChangeBranding: (updatedBranding: Partial<ChurchBranding>) => void;
  onSave: () => void;
  onBack: () => void;
}

const COUNTRIES = ["United States", "United Kingdom", "Nigeria", "Canada", "Brazil", "South Africa", "Australia"];
const TIMEZONES = [
  "(GMT-05:00) EST",
  "(GMT+00:00) UTC",
  "(GMT+01:00) Lagos",
  "(GMT-08:00) PST",
  "(GMT-06:00) CST",
  "(GMT+10:00) AEST",
];
const CHURCH_SIZES = [
  "1 - 50 Members",
  "51 - 100 Members",
  "101 - 500 Members",
  "500+ Members",
];

export default function StepProfile({
  profile,
  branding,
  onChangeProfile,
  onChangeBranding,
  onSave,
  onBack,
}: StepProfileProps) {
  const fileInputRefRef = useRef<HTMLInputElement>(null);
  const [errorStatus, setErrorStatus] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) {
        alert("Please upload a valid image file.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        onChangeBranding({
          logoDataUrl: ev.target?.result as string,
          uploadedLogoName: file.name,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) {
      setErrorStatus("Church Name is required.");
      return;
    }
    setErrorStatus("");
    onSave();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4 }}
      className="relative w-full max-w-[480px] bg-white rounded-sm shadow-[0_10px_35px_rgba(108,43,217,0.05)] border border-gray-100 overflow-hidden"
    >
      {/* Progress Circle (Top Right) */}
      <div className="absolute top-6 right-6 flex items-center justify-center">
        <div className="relative w-12 h-12">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle
              className="text-gray-100"
              cx="18"
              cy="18"
              fill="none"
              r="16"
              strokeWidth="3.5"
            />
            <circle
              className="text-primary-brand"
              cx="18"
              cy="18"
              fill="none"
              r="16"
              strokeDasharray="100"
              strokeDashoffset="25" // 75% on Profile screen (6/8)
              strokeWidth="3.5"
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-primary-brand font-mono">
            75%
          </span>
        </div>
      </div>

      <div className="p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-gray-900 leading-tight mb-2 pr-12">
            Let's set up your church profile
          </h1>
          <p className="text-gray-500 text-xs md:text-sm leading-relaxed">
            This information will appear across presentations, overlays, reports, and exports.
          </p>
        </div>

        {/* Input Form */}
        <div className="space-y-4">
          {/* Church Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 block">
              Church Name <span className="text-red-500 font-bold">*</span>
            </label>
            <input
              type="text"
              required
              value={profile.name}
              onChange={(e) => onChangeProfile({ name: e.target.value })}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-primary-brand/25 focus:border-primary-brand outline-none transition-all placeholder:text-gray-400 bg-[#F9FAFB]"
              placeholder="Grace Community Church"
            />
            {errorStatus && (
              <p className="text-[10px] text-red-500 font-medium pl-1">{errorStatus}</p>
            )}
          </div>

          {/* Logo Upload (In sync with Branding screen) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 block">
              Church Logo
            </label>
            <div
              onClick={() => fileInputRefRef.current?.click()}
              className="flex items-center gap-4 p-3 border-2 border-dashed border-gray-200 rounded-xl bg-[#F9FAFB]/50 hover:bg-[#F9FAFB] hover:border-primary-brand transition-all cursor-pointer group"
            >
              <input
                ref={fileInputRefRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center overflow-hidden border border-gray-100 flex-shrink-0">
                {branding.logoDataUrl ? (
                  <img
                    src={branding.logoDataUrl}
                    alt="Logo"
                    className="w-full h-full object-contain p-0.5"
                  />
                ) : (
                  <Image className="w-5 h-5 text-gray-400 group-hover:text-primary-brand transition-colors" />
                )}
              </div>
              <div className="flex-grow min-w-0">
                <p className="font-semibold text-xs text-primary-brand-dark group-hover:underline truncate">
                  {branding.uploadedLogoName ? "Update Logo" : "Upload Logo"}
                </p>
                <p className="text-[10px] text-gray-400 font-sans mt-0.5 truncate">
                  {branding.uploadedLogoName || "PNG, JPG or SVG. Rec: 512×512"}
                </p>
              </div>
              <div className="text-primary-brand/10">
                <Church className="w-8 h-8 stroke-[1.5]" />
              </div>
            </div>
          </div>

          {/* Website (Optional) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 block">
              Website (Optional)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Globe className="w-4 h-4" />
              </span>
              <input
                type="url"
                value={profile.website}
                onChange={(e) => onChangeProfile({ website: e.target.value })}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-primary-brand/25 focus:border-primary-brand outline-none transition-all placeholder:text-gray-400 bg-[#F9FAFB]"
                placeholder="https://gracecommunity.org"
              />
            </div>
          </div>

          {/* Country & Timezone (Joint details) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">
                Country <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <select
                  value={profile.country}
                  onChange={(e) => onChangeProfile({ country: e.target.value })}
                  className="w-full h-11 px-3 bg-[#F9FAFB] border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary-brand/25 focus:border-primary-brand outline-none appearance-none transition-all pr-8"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none w-1.5 h-1.5 border-r-1.5 border-b-1.5 border-gray-400 rotate-45 transform origin-center" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">
                Timezone <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <select
                  value={profile.timezone}
                  onChange={(e) => onChangeProfile({ timezone: e.target.value })}
                  className="w-full h-11 px-3 bg-[#F9FAFB] border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary-brand/25 focus:border-primary-brand outline-none appearance-none transition-all pr-8"
                >
                  {TIMEZONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none w-1.5 h-1.5 border-r-1.5 border-b-1.5 border-gray-400 rotate-45 transform origin-center" />
              </div>
            </div>
          </div>

          {/* Church Size */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 block">
              Church Size
            </label>
            <div className="relative">
              <select
                value={profile.size}
                onChange={(e) => onChangeProfile({ size: e.target.value })}
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary-brand/25 focus:border-primary-brand outline-none appearance-none transition-all pr-8"
              >
                {CHURCH_SIZES.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none w-1.5 h-1.5 border-r-1.5 border-b-1.5 border-gray-400 rotate-45 transform origin-center" />
            </div>
          </div>

          {/* Back Action & Submit */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-6">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 font-semibold text-xs text-gray-500 hover:text-primary-brand transition-colors group cursor-pointer py-1"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="bg-primary-brand text-white py-3 px-8 rounded-xl font-semibold text-xs shadow-md hover:bg-primary-brand-dark hover:shadow-primary-brand/20 active:scale-97 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Save & Continue
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
