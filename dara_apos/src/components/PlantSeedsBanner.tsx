import React from "react";
import Image from "next/image";

export default function PlantSeedsBanner() {
  return (
    <section className="w-full bg-[#f4f0e1] py-8">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16">
        <div className="relative w-full h-[260px] sm:h-[340px] md:h-[440px] lg:h-[500px] rounded-3xl overflow-hidden shadow-xl border border-[#282d29]/10">
          <Image
            src="/images/plant-seeds-wellness.png"
            alt="Plant seeds of wellness"
            fill
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-8 md:p-14">
            <h3 className="font-chango text-2xl sm:text-3xl md:text-4xl text-[#f4f0e1] drop-shadow-md">
              Plant seeds of wellness
            </h3>
          </div>
        </div>
      </div>
    </section>
  );
}
