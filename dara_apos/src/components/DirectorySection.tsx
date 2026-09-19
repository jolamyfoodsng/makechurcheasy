import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function DirectorySection() {
  return (
    <section id="directory" className="w-full bg-[#f4f0e1] py-12 lg:py-16">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16">
        <div className="rounded-3xl bg-[#7d8a42]/15 border border-[#7d8a42]/30 p-8 md:p-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 flex flex-col justify-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42] block mb-2">
              Community Resources
            </span>
            <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29] mb-4">
              Need Help?
            </h2>
            <p className="font-poppins text-lg sm:text-xl text-[#282d29]/90 leading-relaxed max-w-lg mb-8">
              Check out our service directory to find care solutions and practitioners in your area!
            </p>
            <div>
              <Link
                href="#directory-list"
                className="inline-flex items-center gap-3 px-8 py-3.5 rounded-full bg-[#282d29] text-[#f4f0e1] font-semibold text-sm hover:bg-[#3a413b] transition-all shadow"
              >
                <span>Service Directory</span>
                <ArrowRight size={18} />
              </Link>
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
      </div>
    </section>
  );
}
