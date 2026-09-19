import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function MissionSection() {
  return (
    <section id="mission" className="w-full bg-[#f4f0e1] py-12 lg:py-20">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* Left Text Card */}
        <div className="flex flex-col justify-center">
          <div className="inline-block mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42]">
              Our Purpose
            </span>
          </div>

          <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29] leading-tight mb-6">
            Our Mission
          </h2>

          <p className="font-poppins text-lg sm:text-xl text-[#282d29]/90 leading-relaxed font-normal mb-8">
            To improve the health equity of black women and people who menstruate suffering from PMOS by providing accessible herbal knowledge.
          </p>

          <div>
            <Link
              href="/about"
              className="inline-flex items-center gap-3 px-8 py-3.5 rounded-full bg-[#282d29] text-[#f4f0e1] font-poppins font-semibold text-sm hover:bg-[#3a413b] transition-all transform hover:-translate-y-0.5 shadow"
            >
              <span>Read About Us</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        {/* Right Visual Image Card */}
        <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-lg border border-[#282d29]/10">
          <Image
            src="/images/mission-img.png"
            alt="Herbal botanicals and community care"
            fill
            className="object-cover object-center"
          />
          {/* Subtle branding seal watermark */}
          <div className="absolute top-5 right-5 w-14 h-14 rounded-full bg-[#f4f0e1]/80 backdrop-blur-sm flex items-center justify-center p-2.5">
            <div className="relative w-full h-full">
              <Image
                src="/icons/logo.svg"
                alt="Dara Seal"
                fill
                className="object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
