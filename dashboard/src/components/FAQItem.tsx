"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQItemProps {
  question: string;
  answer: string;
}

export function FAQItem({ question, answer }: FAQItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`border rounded-2xl transition-all ${
        open
          ? "bg-white border-[#1D4ED8]/20 shadow-md"
          : "bg-white border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-sm"
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left group cursor-pointer"
      >
        <span
          className={`text-sm font-semibold transition-colors ${
            open ? "text-[#1D4ED8]" : "text-[#0F172A] group-hover:text-[#1D4ED8]"
          }`}
        >
          {question}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-300 ${
            open
              ? "rotate-180 text-[#1D4ED8]"
              : "text-[#94A3B8] group-hover:text-[#64748B]"
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 pb-5 text-sm text-[#64748B] leading-relaxed">
          {answer}
        </div>
      </div>
    </div>
  );
}
