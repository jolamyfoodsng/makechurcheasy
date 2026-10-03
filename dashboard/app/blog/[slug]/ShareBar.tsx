"use client";

import { useState } from "react";
import { Copy, Check, Twitter, Linkedin } from "lucide-react";
import styles from "../blog.module.css";

export function ShareBar({ title, slug }: { title: string; slug: string }) {
  const [status, setStatus] = useState("");
  const url = `https://makechurcheazy.com/blog/${encodeURIComponent(slug)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
    } catch {
      setStatus("Could not copy the link. Copy the address from your browser instead.");
    }
  }
  return <div className={styles.share}>
    <button type="button" onClick={copy}>{status === "Link copied" ? <Check size={18}/> : <Copy size={18}/>} Copy link</button>
    <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Share article on X (opens a new tab)"><Twitter size={18}/></a>
    <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Share article on LinkedIn (opens a new tab)"><Linkedin size={18}/></a>
    <span role="status" className={styles.shareStatus}>{status}</span>
  </div>;
}
