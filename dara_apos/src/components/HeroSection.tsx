import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="w-full relative overflow-hidden bg-[#f4f0e1]">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16 py-10 lg:py-16">
        {/* Main Banner Card */}
        <div className="relative rounded-3xl overflow-hidden min-h-[460px] lg:min-h-[540px] flex flex-col justify-end p-8 md:p-14 text-[#f4f0e1] shadow-xl">
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
            <Image
              src="/images/hero-bg.png"
              alt="Botanical garden & herbal wellness"
              fill
              className="object-cover object-center brightness-[0.82]"
              priority
            />
            {/* Soft botanical gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          </div>

          {/* Hero Content */}
          <div className="relative z-10 max-w-2xl">
            <h1 className="font-chango text-3xl sm:text-4xl md:text-5xl lg:text-5xl leading-tight text-[#f4f0e1] tracking-tight">
              Tending to your garden as a mind, body and spirit cleanser
            </h1>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/about"
                className="inline-flex items-center justify-center px-7 py-3 rounded-full bg-[#f4f0e1] text-[#282d29] font-poppins font-semibold text-sm hover:bg-white transition-all transform hover:-translate-y-0.5 shadow-md"
              >
                About us
              </Link>
              <Link
                href="#archive"
                className="inline-flex items-center justify-center px-7 py-3 rounded-full bg-[#aea1ff] text-[#282d29] font-poppins font-semibold text-sm hover:bg-[#b8acff] transition-all transform hover:-translate-y-0.5 shadow-md"
              >
                Herbal Archive
              </Link>
            </div>
          </div>
        </div>

        {/* Featured Event Notification Card */}
        <div className="mt-6 w-full rounded-2xl bg-[#aea1ff]/20 border border-[#aea1ff]/30 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="px-3.5 py-1.5 rounded-full bg-[#aea1ff] text-[#282d29] font-semibold text-xs uppercase tracking-wider">
              Upcoming
            </div>
            <h2 className="font-chango text-2xl md:text-3xl text-[#282d29]">
              Event - 30/06
            </h2>
          </div>

          <Link
            href="#events"
            className="inline-flex items-center gap-2 text-[#282d29] hover:text-[#7d8a42] font-semibold text-base md:text-lg transition-colors group"
          >
            <span>Click to find out more</span>
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
