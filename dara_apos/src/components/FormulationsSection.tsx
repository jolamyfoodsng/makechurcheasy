import React from "react";
import Image from "next/image";

export default function FormulationsSection() {
  const formulations = [
    {
      title: "Isphagula Herb",
      desc: "To improve the health equity of black women and people who menstruate suffering from PMOS by providing accessible herbal knowledge.",
      tag: "Balancing",
    },
    {
      title: "Scent Leaf Infusion",
      desc: "Small-batch blend aiding digestion, respiratory relief, and cyclical balance.",
      tag: "Cleansing",
    },
    {
      title: "Ginger & Cinnamon Elixir",
      desc: "Nourishing warmth designed to support gentle flow and alleviate cramps.",
      tag: "Warming",
    },
    {
      title: "Ashwagandha Tonic",
      desc: "Adaptogenic formula curated for stress management and adrenals.",
      tag: "Restorative",
    },
    {
      title: "Hibiscus Vitality",
      desc: "Antioxidant-rich infusion promoting healthy blood circulation and stamina.",
      tag: "Vitality",
    },
    {
      title: "Chamomile & Nettle",
      desc: "Nutrient-dense mineral botanical soak and tea for restful sleep.",
      tag: "Calming",
    },
  ];

  return (
    <section id="formulations" className="w-full bg-[#f4f0e1] py-14 lg:py-20 border-t border-[#282d29]/10">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16">
        {/* Section Header */}
        <div className="mb-12">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42] block mb-2">
            Handcrafted
          </span>
          <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29] mb-3">
            Our Formulations
          </h2>
          <p className="text-base sm:text-lg text-[#282d29]/80 max-w-xl">
            Six preparations from the archive, made here in small batches.
          </p>
        </div>

        {/* Formulations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {formulations.map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-6 border border-[#282d29]/10 shadow-sm flex flex-col justify-between hover:border-[#7d8a42]/40 transition-all hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#aea1ff]/20 text-[#282d29]">
                    {item.tag}
                  </span>
                  <span className="text-xs text-[#282d29]/40 font-mono">
                    #0{index + 1}
                  </span>
                </div>

                <div className="relative w-full h-40 mb-6 bg-[#f4f0e1]/60 rounded-xl overflow-hidden flex items-center justify-center">
                  <Image
                    src="/images/scent-leaf.png"
                    alt={item.title}
                    fill
                    className="object-contain p-4 transition-transform hover:scale-105 duration-300"
                  />
                </div>

                <h3 className="font-chango text-xl text-[#282d29] mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-[#282d29]/80 leading-relaxed font-poppins">
                  {item.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-[#282d29]/10 flex items-center justify-between text-xs font-semibold text-[#7d8a42]">
                <span>Archival Recipe</span>
                <span>Small Batch</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
