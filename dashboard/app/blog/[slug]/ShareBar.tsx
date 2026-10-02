"use client";

import React, { useState } from "react";
import { Copy, Check, Twitter, Linkedin, Share2 } from "lucide-react";

interface ShareBarProps {
  title: string;
  slug: string;
}

export function ShareBar({ title, slug }: ShareBarProps) {
  const [copied, setCopied] = useState(false);

  const getUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/blog/${slug}`;
    }
    return `https://makechurcheazy.com/blog/${slug}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTwitter = () => {
    const url = encodeURIComponent(getUrl());
    const text = encodeURIComponent(`"${title}" via @makechurcheasy`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  };

  const handleLinkedIn = () => {
    const url = encodeURIComponent(getUrl());
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
  };

  return (
    <div className="flex items-center gap-1.5 text-slate-400">
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs hover:border-slate-700 hover:text-white transition"
        title="Copy article link"
      >
        {copied ? (
          <>
            <Check size={13} className="text-emerald-400" />
            <span className="text-emerald-400">Copied</span>
          </>
        ) : (
          <>
            <Copy size={13} />
            <span>Copy Link</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleTwitter}
        className="rounded-lg border border-slate-800 bg-slate-900/80 p-1.5 hover:border-slate-700 hover:text-white transition"
        title="Share on X"
      >
        <Twitter size={13} />
      </button>

      <button
        type="button"
        onClick={handleLinkedIn}
        className="rounded-lg border border-slate-800 bg-slate-900/80 p-1.5 hover:border-slate-700 hover:text-white transition"
        title="Share on LinkedIn"
      >
        <Linkedin size={13} />
      </button>
    </div>
  );
}
