import React from "react";
import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const footerLinks = [
    { name: "About us", href: "/about" },
    { name: "Herbal Archive", href: "/#archive" },
    { name: "PMOS", href: "/#mission" },
    { name: "Menstrual Cycle", href: "/#formulations" },
    { name: "Service Directory", href: "/#directory" },
    { name: "Glossary", href: "/#blog" },
  ];

  return (
    <footer className="w-full bg-[#282d29] text-[#f4f0e1] pt-14 pb-12">
      {/* Top Bar with Dara Apothecary Banner */}
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16 border-b border-[#f4f0e1]/20 pb-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative w-64 h-12">
            <Image
              src="/icons/dara-apothecary-text.svg"
              alt="Dara Apothecary"
              fill
              className="object-contain filter invert"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 rounded-full border border-[#f4f0e1]/30 flex items-center justify-center hover:bg-[#f4f0e1]/10 transition-colors"
            aria-label="Instagram"
          >
            <div className="relative w-5 h-5">
              <Image
                src="/icons/instagram.svg"
                alt="Instagram"
                fill
                className="object-contain filter invert"
              />
            </div>
          </a>
        </div>
      </div>

      {/* Main Footer Links & Funding Information */}
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16 pt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#f4f0e1]/60 font-medium block mb-3">
            Funded by
          </span>
          <div className="font-poppins text-lg font-semibold tracking-wide text-[#f4f0e1]">
            Black Food Fund
          </div>
          <p className="mt-2 text-sm text-[#f4f0e1]/70 max-w-sm leading-relaxed">
            Supporting community initiatives for health equity, herbal literacy, and inclusive well-being.
          </p>
        </div>

        <div>
          <span className="text-xs uppercase tracking-widest text-[#f4f0e1]/60 font-medium block mb-4">
            Navigation
          </span>
          <ul className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-sm font-medium">
            {footerLinks.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className="hover:text-[#aea1ff] transition-colors"
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest text-[#f4f0e1]/60 font-medium block mb-3">
              Holistic Care
            </span>
            <p className="text-sm text-[#f4f0e1]/70 leading-relaxed">
              Tending to your garden as a mind, body and spirit cleanser. Small-batch formulations and ancestral botanical remedies.
            </p>
          </div>
          <div className="pt-6 text-xs text-[#f4f0e1]/40">
            © {new Date().getFullYear()} Dara Apothecary. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
