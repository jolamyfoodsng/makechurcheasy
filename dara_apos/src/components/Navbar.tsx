"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

interface NavbarProps {
  activePage?: string;
}

export default function Navbar({ activePage }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "About the Project", href: "/about" },
    { name: "Herbal Archive", href: "/#archive" },
    { name: "PMOS", href: "/#mission" },
    { name: "Menstrual Cycle", href: "/#formulations" },
    { name: "Service Directory", href: "/#directory" },
    { name: "Glossary", href: "/#blog" },
  ];

  return (
    <header className="w-full bg-[#f4f0e1] border-b border-[#282d29]/10 relative z-50">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16 py-5 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="w-24 md:w-28 relative h-7">
            <Image
              src="/icons/logo.svg"
              alt="DARA Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-8 text-[15px] font-semibold text-[#282d29]">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className={`transition-colors hover:text-[#7d8a42] ${
                activePage === link.name ? "text-[#7d8a42] underline underline-offset-4" : ""
              }`}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Mobile Hamburger Toggle */}
        <div className="lg:hidden flex items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#282d29] focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-down / Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#f4f0e1] border-b border-[#282d29]/20 px-6 py-6 shadow-lg">
          <nav className="flex flex-col gap-4 text-base font-semibold text-[#282d29]">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 hover:text-[#7d8a42] border-b border-[#282d29]/10 last:border-b-0"
              >
                {link.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
