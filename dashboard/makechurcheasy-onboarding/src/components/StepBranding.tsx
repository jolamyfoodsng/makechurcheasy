import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Palette, UploadCloud, FileImage, Church, Check } from "lucide-react";
import { ChurchBranding } from "../types";

interface StepBrandingProps {
  branding: ChurchBranding;
  onChange: (updatedBranding: Partial<ChurchBranding>) => void;
  onContinue: () => void;
  onBack: () => void;
}

const PRIMARY_PRESETS = [
  { name: "Purple Dream", hex: "#6C2BD9" },
  { name: "Royal Purple", hex: "#5300B9" },
  { name: "Amethyst", hex: "#7233DF" },
  { name: "Classic Navy", hex: "#1E3A8A" },
  { name: "Deep Crimson", hex: "#991B1B" },
];

const SECONDARY_PRESETS = [
  { name: "Emerald Growth", hex: "#10B981" },
  { name: "Forest Green", hex: "#006C49" },
  { name: "Mint Spark", hex: "#6CF8BB" },
  { name: "Sky Calm", hex: "#0EA5E9" },
];

const ACCENT_PRESETS = [
  { name: "Warm Amber", hex: "#F59E0B" },
  { name: "Gold Sunbeams", hex: "#EAB308" },
  { name: "Harvest Bronze", hex: "#7D4E00" },
  { name: "Sunset Orange", hex: "#F97316" },
];

export default function StepBranding({
  branding,
  onChange,
  onContinue,
  onBack,
}: StepBrandingProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);


  // Parse files
  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, SVG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onChange({
        logoDataUrl: e.target?.result as string,
        uploadedLogoName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
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
      <div className="absolute top-8 right-8 flex flex-col items-center">
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
              strokeDashoffset="37.5" // 62.5% complete (5/8)
              strokeWidth="3.5"
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-primary-brand">
            63%
          </span>
        </div>
      </div>

      <div className="p-8">
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 pr-12">
            <Palette className="text-primary-brand w-6 h-6 stroke-[2]" />
            <h2 className="font-display font-bold text-xl text-gray-900 leading-tight">
              Branding Setup
            </h2>
          </div>
          <p className="text-gray-500 text-xs md:text-sm leading-relaxed">
            Customize your church branding. These colors and logo will be used in your presentations and graphics.
          </p>
        </div>

        {/* Form elements */}
        <div className="space-y-5">
          {/* Primary Color */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-700">
              <label>Primary Color</label>
              <span className="text-[10px] text-gray-400 font-mono">{branding.primaryColor}</span>
            </div>
            <div className="flex items-center gap-2">
              {PRIMARY_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => onChange({ primaryColor: p.hex })}
                  className={`w-8 h-8 rounded-lg border-2 transition-all cursor-pointer flex-shrink-0 ${branding.primaryColor.toLowerCase() === p.hex.toLowerCase()
                    ? "border-gray-900 scale-110 shadow-md"
                    : "border-gray-200 hover:border-gray-400"
                    }`}
                  style={{ backgroundColor: p.hex }}
                  title={p.name}
                />
              ))}
              <label className="relative w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-brand cursor-pointer flex-shrink-0 flex items-center justify-center overflow-hidden transition-colors">
                <span className="text-[10px] text-gray-400 font-bold">+</span>
                <input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(e) => onChange({ primaryColor: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Secondary Color */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-700">
              <label>Secondary Color</label>
              <span className="text-[10px] text-gray-400 font-mono">{branding.secondaryColor}</span>
            </div>
            <div className="flex items-center gap-2">
              {SECONDARY_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => onChange({ secondaryColor: p.hex })}
                  className={`w-8 h-8 rounded-lg border-2 transition-all cursor-pointer flex-shrink-0 ${branding.secondaryColor.toLowerCase() === p.hex.toLowerCase()
                    ? "border-gray-900 scale-110 shadow-md"
                    : "border-gray-200 hover:border-gray-400"
                    }`}
                  style={{ backgroundColor: p.hex }}
                  title={p.name}
                />
              ))}
              <label className="relative w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-brand cursor-pointer flex-shrink-0 flex items-center justify-center overflow-hidden transition-colors">
                <span className="text-[10px] text-gray-400 font-bold">+</span>
                <input
                  type="color"
                  value={branding.secondaryColor}
                  onChange={(e) => onChange({ secondaryColor: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Accent Color */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-700">
              <label>Accent Color</label>
              <span className="text-[10px] text-gray-400 font-mono">{branding.accentColor}</span>
            </div>
            <div className="flex items-center gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => onChange({ accentColor: p.hex })}
                  className={`w-8 h-8 rounded-lg border-2 transition-all cursor-pointer flex-shrink-0 ${branding.accentColor.toLowerCase() === p.hex.toLowerCase()
                    ? "border-gray-900 scale-110 shadow-md"
                    : "border-gray-200 hover:border-gray-400"
                    }`}
                  style={{ backgroundColor: p.hex }}
                  title={p.name}
                />
              ))}
              <label className="relative w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-brand cursor-pointer flex-shrink-0 flex items-center justify-center overflow-hidden transition-colors">
                <span className="text-[10px] text-gray-400 font-bold">+</span>
                <input
                  type="color"
                  value={branding.accentColor}
                  onChange={(e) => onChange({ accentColor: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Church Logo Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 block">
              Church Logo
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-4 p-4 border-2 border-dashed rounded-xl bg-[#F9FAFB]/50 hover:bg-[#F9FAFB]/85 hover:border-primary-brand transition-all cursor-pointer group ${isDragOver ? "border-primary-brand bg-primary-brand/5" : "border-gray-200"
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Logo icon container */}
              <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden flex-shrink-0">
                {branding.logoDataUrl ? (
                  <img
                    src={branding.logoDataUrl}
                    alt="Uploaded Logo Preview"
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <UploadCloud className="text-gray-400 group-hover:text-primary-brand group-hover:scale-110 w-6 h-6 transition-all duration-200" />
                )}
              </div>

              {/* Logo text info */}
              <div className="flex-grow min-w-0">
                <p className="font-semibold text-xs text-gray-800 truncate">
                  {branding.uploadedLogoName || "Upload Logo"}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed font-sans">
                  PNG, JPG or SVG (Rec: 512×512)
                </p>
              </div>

              {/* Right decorative logo symbol */}
              <div className="text-primary-brand/10 group-hover:text-primary-brand/20 transition-colors">
                <Church className="w-9 h-9 stroke-[1.5]" />
              </div>
            </div>
          </div>

          {/* Live Preview Elements styled dynamically */}
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <label className="text-xs font-semibold text-gray-500 block">
              Live Preview
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Overlay 1: Scripture Overlay */}
              <div className="space-y-1">
                <div className="aspect-video bg-gray-900 rounded-lg border border-gray-800 relative overflow-hidden flex items-end p-1">
                  <div className="w-full h-2 rounded-sm bg-black/40 border-l-2 p-0.5 flex items-center" style={{ borderLeftColor: branding.primaryColor }}>
                    <div className="w-2/3 h-0.5 rounded-full" style={{ backgroundColor: branding.primaryColor }} />
                  </div>
                </div>
                <p className="text-[9px] font-medium text-center text-gray-400 font-sans">
                  Scripture Overlay
                </p>
              </div>

              {/* Overlay 2: Lower Thirds */}
              <div className="space-y-1">
                <div className="aspect-video bg-gray-900 rounded-lg border border-gray-800 relative overflow-hidden flex items-end p-1">
                  <div
                    className="w-full h-3 rounded-sm flex items-center px-1 border-l-2"
                    style={{
                      backgroundColor: `${branding.primaryColor}15`,
                      borderLeftColor: branding.secondaryColor
                    }}
                  >
                    <div className="w-1/2 h-0.5 rounded-full" style={{ backgroundColor: branding.secondaryColor }} />
                  </div>
                </div>
                <p className="text-[9px] font-medium text-center text-gray-400 font-sans">
                  Lower Thirds
                </p>
              </div>

              {/* Overlay 3: Announcements */}
              <div className="space-y-1">
                <div
                  className="aspect-video rounded-lg border border-opacity-20 relative overflow-hidden flex flex-col items-center justify-center p-1"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.primaryColor}ee)`,
                    borderColor: branding.primaryColor
                  }}
                >
                  <div className="w-1/2 h-0.5 rounded-full mb-0.5 bg-white/20" />
                  <div className="w-2/3 h-1.5 rounded-sm bg-white" />
                  <div className="w-4 h-4 rounded-full absolute -top-1 -right-1 opacity-20" style={{ backgroundColor: branding.accentColor }} />
                </div>
                <p className="text-[9px] font-medium text-center text-gray-400 font-sans">
                  Announcements
                </p>
              </div>
            </div>
          </div>

          {/* Action Navigation bar */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
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
              onClick={onContinue}
              className="bg-primary-brand text-white py-3 px-8 rounded-xl font-semibold text-xs shadow-md hover:bg-primary-brand-dark hover:shadow-primary-brand/20 active:scale-97 transition-all cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
