import React from "react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BlogSection from "@/components/BlogSection";
import PlantSeedsBanner from "@/components/PlantSeedsBanner";
import { Heart, Compass, Sparkles, ArrowRight } from "lucide-react";

export default function AboutPage() {
  const values = [
    {
      title: "Compassion",
      icon: Heart,
      desc: "Centering the lived experiences of black women and people who menstruate with empathetic care and radical listening.",
    },
    {
      title: "Curiosity",
      icon: Compass,
      desc: "Revitalizing ancestral herbalism, continuous botanical study, and open inquiry into body autonomy and herbal wisdom.",
    },
    {
      title: "Respect",
      icon: Sparkles,
      desc: "Honoring nature's cycles, cultural lineages, and community traditions without commodification.",
    },
  ];

  return (
    <main className="min-h-screen flex flex-col bg-[#f4f0e1] selection:bg-[#aea1ff] selection:text-[#282d29]">
      <Navbar activePage="About the Project" />

      {/* Hero Header Frame */}
      <section className="w-full py-12 lg:py-20 bg-[#f4f0e1] border-b border-[#282d29]/10">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-16 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42] block mb-3">
            Our Identity
          </span>
          <h1 className="font-chango text-3xl sm:text-5xl lg:text-6xl text-[#282d29] leading-tight mb-6">
            Created by us. For us.
          </h1>
          <p className="font-poppins text-lg sm:text-xl text-[#282d29]/80 max-w-2xl mx-auto leading-relaxed">
            Dara Apothecary bridges ancestral botanical lineages and accessible holistic education to dismantle health disparities for people who menstruate.
          </p>
        </div>
      </section>

      {/* Featured Banner */}
      <PlantSeedsBanner />

      {/* Story 1: About the Project */}
      <section className="w-full py-14 lg:py-20">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-7">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#aea1ff] block mb-2">
              The Genesis
            </span>
            <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29] mb-6">
              About the project
            </h2>
            <div className="space-y-4 font-poppins text-base sm:text-lg text-[#282d29]/85 leading-relaxed">
              <p>
                Scent leaf is the aromatic herb <em>Ocimum gratissimum L.</em>, a member of the mint family, Lamiaceae. It is widely distributed throughout tropical and subtropical regions of the Old World, including Nigeria and other parts of West Africa.
              </p>
              <p>
                Its strongly aromatic leaves have made the plant valuable both as a culinary herb and as a traditional medicinal plant. The leaves are commonly incorporated into soups, stews and other foods, while preparations of the plant have long featured in traditional African medicine.
              </p>
            </div>

            <div className="mt-8 p-5 rounded-2xl bg-white border border-[#282d29]/10 font-mono text-xs text-[#282d29]/70 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><span className="font-bold">Kingdom:</span> Plantae</div>
              <div><span className="font-bold">Order:</span> Lamiales</div>
              <div><span className="font-bold">Family:</span> Lamiaceae</div>
              <div><span className="font-bold">Genus:</span> Ocimum</div>
              <div className="col-span-2"><span className="font-bold">Species:</span> Ocimum gratissimum</div>
            </div>
          </div>

          <div className="lg:col-span-5 relative aspect-[4/5] rounded-3xl overflow-hidden shadow-lg border border-[#282d29]/10">
            <Image
              src="/images/brand-guide-19.png"
              alt="Dara Apothecary Guide & Formulations"
              fill
              className="object-cover object-center"
            />
          </div>
        </div>
      </section>

      {/* Story 2: Who is BlackFood to us? */}
      <section className="w-full py-14 lg:py-20 bg-white border-y border-[#282d29]/10">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-5 order-2 lg:order-1 relative aspect-[4/5] rounded-3xl overflow-hidden shadow-lg border border-[#282d29]/10">
            <Image
              src="/images/community-table.png"
              alt="Community Gathering & Heritage"
              fill
              className="object-cover object-center"
            />
          </div>

          <div className="lg:col-span-7 order-1 lg:order-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42] block mb-2">
              Community & Lineage
            </span>
            <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29] mb-6">
              Who is BlackFood to us?
            </h2>
            <div className="space-y-4 font-poppins text-base sm:text-lg text-[#282d29]/85 leading-relaxed">
              <p>
                Food and botanical medicine are inextricably linked in African and diaspora heritage. What nourishes the pot also heals the womb and revitalizes cyclical rhythm.
              </p>
              <p>
                Through the partnership with Black Food Fund, we preserve botanical memory, offer workshops, and build community repositories that demystify health management for menstrual disorders and chronic conditions.
              </p>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <Link
                href="/#directory"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[#282d29] text-[#f4f0e1] font-semibold text-sm hover:bg-[#3a413b] transition-all"
              >
                <span>Find Practitioners</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Our Values Section */}
      <section className="w-full py-16 lg:py-24 bg-[#f4f0e1]">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-16">
          <div className="text-center max-w-xl mx-auto mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42] block mb-2">
              Core Principles
            </span>
            <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29]">
              Our Values
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {values.map((v, i) => {
              const Icon = v.icon;
              return (
                <div
                  key={i}
                  className="bg-white rounded-3xl p-8 border border-[#282d29]/10 shadow-sm flex flex-col items-center text-center hover:border-[#aea1ff] transition-all hover:shadow-md"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#aea1ff]/20 text-[#282d29] flex items-center justify-center mb-6">
                    <Icon size={28} />
                  </div>
                  <h3 className="font-chango text-2xl text-[#282d29] mb-4">
                    {v.title}
                  </h3>
                  <p className="text-sm sm:text-base text-[#282d29]/80 leading-relaxed font-poppins">
                    {v.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Shared Blog Section */}
      <BlogSection />

      <Footer />
    </main>
  );
}
