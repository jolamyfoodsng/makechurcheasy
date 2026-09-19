import React from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import MissionSection from "@/components/MissionSection";
import PlantSeedsBanner from "@/components/PlantSeedsBanner";
import HerbalArchiveSection from "@/components/HerbalArchiveSection";
import FormulationsSection from "@/components/FormulationsSection";
import DirectorySection from "@/components/DirectorySection";
import BlogSection from "@/components/BlogSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-[#f4f0e1] selection:bg-[#aea1ff] selection:text-[#282d29]">
      <Navbar />
      <HeroSection />
      <MissionSection />
      <PlantSeedsBanner />
      <HerbalArchiveSection />
      <FormulationsSection />
      <DirectorySection />
      <BlogSection />
      <Footer />
    </main>
  );
}
