"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ArrowRight, ExternalLink, Tag } from "lucide-react";

export type DirectoryCategory =
  | "all"
  | "menstrual health"
  | "herbs"
  | "food"
  | "community space"
  | "books"
  | "digital";

export interface DirectoryItem {
  id: string;
  title: string;
  category: DirectoryCategory;
  description: string;
  location?: string;
  link?: string;
  tags: string[];
}

const FILTER_LABELS: { label: string; value: DirectoryCategory }[] = [
  { label: "All Resources", value: "all" },
  { label: "Menstrual Health", value: "menstrual health" },
  { label: "Herbs", value: "herbs" },
  { label: "Food", value: "food" },
  { label: "Community Space", value: "community space" },
  { label: "Books", value: "books" },
  { label: "Digital", value: "digital" },
];

const SAMPLE_DIRECTORY: DirectoryItem[] = [
  {
    id: "dir-1",
    title: "Holistic Pelvic & Menstrual Care Network",
    category: "menstrual health",
    description:
      "Supportive care practitioners specializing in cycle mapping, endometriosis care, and herbal reproductive wellness.",
    location: "Community & Online",
    tags: ["menstrual health", "care", "wellness"],
  },
  {
    id: "dir-2",
    title: "Botanical Remedy & Apothecary Collective",
    category: "herbs",
    description:
      "Community herbalists offering ethically harvested tinctures, teas, and formulation guides for hormone support.",
    location: "Local & Mail Order",
    tags: ["herbs", "apothecary", "formulations"],
  },
  {
    id: "dir-3",
    title: "Nourishing Food & Herbal Kitchen",
    category: "food",
    description:
      "Nutritional guidance and food sovereignty initiatives supplying cycle-nourishing whole foods and iron-rich herbs.",
    location: "Community Garden & Kitchen",
    tags: ["food", "nutrition", "herbal meals"],
  },
  {
    id: "dir-4",
    title: "Sacred Healing & Gathering Space",
    category: "community space",
    description:
      "A physical sanctuary for workshops, restorative circles, herbal preparation, and peer support gatherings.",
    location: "Community Hub",
    tags: ["community space", "sanctuary", "workshops"],
  },
  {
    id: "dir-5",
    title: "Botanical Memory & Herbal Library",
    category: "books",
    description:
      "Curated literature and reference books covering traditional healing traditions, botany, and reproductive justice.",
    location: "Library & Archive",
    tags: ["books", "reading", "education"],
  },
  {
    id: "dir-6",
    title: "Digital Healing & Symptom Tracker",
    category: "digital",
    description:
      "Interactive open-access tools, downloadable PDFs, and digital guides for tracking symptom patterns.",
    location: "Online Access",
    tags: ["digital", "guides", "open source"],
  },
];

export default function DirectorySection() {
  const [activeCategory, setActiveCategory] = useState<DirectoryCategory>("all");

  const filteredItems =
    activeCategory === "all"
      ? SAMPLE_DIRECTORY
      : SAMPLE_DIRECTORY.filter((item) => item.category === activeCategory);

  return (
    <section id="directory" className="w-full bg-[#f4f0e1] py-12 lg:py-16">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16">
        {/* Header Banner */}
        <div className="rounded-3xl bg-[#7d8a42]/15 border border-[#7d8a42]/30 p-8 md:p-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-12">
          <div className="lg:col-span-7 flex flex-col justify-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42] block mb-2">
              Community Support Directory
            </span>
            <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29] mb-4">
              Need Help?
            </h2>
            <p className="font-poppins text-lg sm:text-xl text-[#282d29]/90 leading-relaxed max-w-lg mb-8">
              Explore our support directory to find care solutions, community spaces, herbal resources, and practitioners!
            </p>
            <div>
              <a
                href="#directory-list"
                className="inline-flex items-center gap-3 px-8 py-3.5 rounded-full bg-[#282d29] text-[#f4f0e1] font-semibold text-sm hover:bg-[#3a413b] transition-all shadow"
              >
                <span>Browse Directory</span>
                <ArrowRight size={18} />
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 relative aspect-[4/3] rounded-2xl overflow-hidden shadow-md">
            <Image
              src="/images/help-directory.png"
              alt="Herbal practitioners and wellness directory"
              fill
              className="object-cover object-center"
            />
          </div>
        </div>

        {/* Support Directory Filter Section */}
        <div id="directory-list" className="mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h3 className="font-chango text-2xl text-[#282d29]">Support Directory</h3>
              <p className="text-[#282d29]/70 text-sm mt-1">
                Filter resources by area of care and community support
              </p>
            </div>
          </div>

          {/* Filter Labels / Chips */}
          <div className="flex flex-wrap gap-2 md:gap-3 mb-8">
            {FILTER_LABELS.map((tab) => {
              const isActive = activeCategory === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveCategory(tab.value)}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold capitalize transition-all ${
                    isActive
                      ? "bg-[#282d29] text-[#f4f0e1] shadow-md scale-105"
                      : "bg-[#7d8a42]/10 text-[#282d29] hover:bg-[#7d8a42]/20 border border-[#7d8a42]/20"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Directory Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-[#fcfaf4] border border-[#282d29]/10 rounded-2xl p-6 flex flex-col justify-between hover:shadow-lg transition-all hover:-translate-y-1"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#7d8a42]/15 text-[#7d8a42] text-xs font-semibold capitalize">
                      <Tag size={12} />
                      {item.category}
                    </span>
                    {item.location && (
                      <span className="text-xs text-[#282d29]/60 font-medium">
                        {item.location}
                      </span>
                    )}
                  </div>
                  <h4 className="font-chango text-lg text-[#282d29] mb-2">{item.title}</h4>
                  <p className="text-sm text-[#282d29]/80 leading-relaxed mb-4">
                    {item.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#282d29]/10 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] text-[#282d29]/60 bg-[#282d29]/5 px-2 py-0.5 rounded"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-[#7d8a42] hover:text-[#282d29] text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <span>View</span>
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
