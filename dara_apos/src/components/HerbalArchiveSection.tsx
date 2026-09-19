import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HerbalArchiveSection() {
  return (
    <section id="archive" className="w-full bg-[#f4f0e1] py-14 lg:py-20">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42] block mb-2">
              Botanical Library
            </span>
            <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29]">
              Archive
            </h2>
            <p className="mt-3 font-poppins text-base sm:text-lg text-[#282d29]/80 max-w-xl">
              To improve the health equity of black women and people who menstruate suffering from PMOS by providing accessible herbal knowledge.
            </p>
          </div>

          <div>
            <Link
              href="#formulations"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[#282d29] text-[#282d29] font-semibold text-sm hover:bg-[#282d29] hover:text-[#f4f0e1] transition-colors"
            >
              <span>View ALL</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Featured Archive Card */}
        <div className="w-full rounded-3xl bg-white border border-[#282d29]/10 p-8 md:p-12 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 flex flex-col justify-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#aea1ff] block mb-2">
              Featured Botanical
            </span>
            <h3 className="font-chango text-2xl sm:text-3xl text-[#282d29] mb-4">
              Scent Leaf (Ocimum gratissimum)
            </h3>
            <p className="text-sm sm:text-base text-[#282d29]/80 leading-relaxed font-poppins mb-6">
              Scent leaf is the aromatic herb Ocimum gratissimum L., a member of the mint family, Lamiaceae. It is widely distributed throughout tropical and subtropical regions of the Old World, including Nigeria and other parts of West Africa.
            </p>
            <div className="p-4 rounded-xl bg-[#f4f0e1]/70 border border-[#282d29]/10 text-xs text-[#282d29]/70 space-y-1 font-mono">
              <p>Kingdom: Plantae | Order: Lamiales</p>
              <p>Family: Lamiaceae | Genus: Ocimum | Species: O. gratissimum</p>
            </div>
          </div>

          <div className="lg:col-span-5 relative aspect-square sm:aspect-[4/3] rounded-2xl overflow-hidden bg-[#f4f0e1]">
            <Image
              src="/images/scent-leaf.png"
              alt="Scent Leaf"
              fill
              className="object-contain p-6"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
