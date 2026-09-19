import React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function BlogSection() {
  const posts = [
    {
      title: "Ispahagula",
      desc: "To improve the health equity of black women and people who menstruate.",
      tag: "Botanicals",
      readTime: "4 min read",
    },
    {
      title: "Scent Leaf Teas & Infusions",
      desc: "Traditional preparation methods to ease cramping and promote tranquility.",
      tag: "Remedies",
      readTime: "6 min read",
    },
    {
      title: "Understanding PMOS Cycles",
      desc: "Accessible science and ancestral wisdom for cycle harmony.",
      tag: "Holistic Health",
      readTime: "5 min read",
    },
  ];

  return (
    <section id="blog" className="w-full bg-[#f4f0e1] py-14 lg:py-20 border-t border-[#282d29]/10">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-16">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[#7d8a42] block mb-2">
              Stories & Insights
            </span>
            <h2 className="font-chango text-3xl sm:text-4xl text-[#282d29]">
              Our Blog
            </h2>
          </div>

          <Link
            href="#all-articles"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#282d29] hover:text-[#7d8a42] transition-colors group"
          >
            <span>Read More</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Blog Post Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post, idx) => (
            <article
              key={idx}
              className="bg-white rounded-3xl overflow-hidden border border-[#282d29]/10 shadow-sm flex flex-col justify-between hover:shadow-md transition-all hover:border-[#aea1ff]/60"
            >
              <div>
                <div className="relative w-full aspect-[16/10] bg-[#f4f0e1]">
                  <Image
                    src="/images/blog-tea.png"
                    alt={post.title}
                    fill
                    className="object-cover object-center"
                  />
                  <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-[#aea1ff] text-[#282d29] text-xs font-semibold">
                    {post.tag}
                  </div>
                </div>

                <div className="p-6 sm:p-8">
                  <h3 className="font-chango text-xl text-[#282d29] mb-3">
                    {post.title}
                  </h3>
                  <p className="text-sm text-[#282d29]/80 leading-relaxed font-poppins">
                    {post.desc}
                  </p>
                </div>
              </div>

              <div className="px-6 sm:px-8 pb-6 pt-2 flex items-center justify-between text-xs font-semibold text-[#282d29]/60 border-t border-[#282d29]/5">
                <span>{post.readTime}</span>
                <span className="text-[#7d8a42] font-semibold flex items-center gap-1 group-hover:underline">
                  Read article &rarr;
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
