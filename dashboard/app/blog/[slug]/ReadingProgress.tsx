"use client";
import { useEffect, useState } from "react";
import styles from "../blog.module.css";
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const article = document.getElementById("story-content");
      if (!article) return;
      const bounds = article.getBoundingClientRect();
      const distance = bounds.height - window.innerHeight;
      setProgress(distance > 0 ? Math.min(1, Math.max(0, -bounds.top / distance)) : 1);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    const article = document.getElementById("story-content");
    if (article) observer.observe(article);
    measure();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); observer.disconnect(); };
  }, []);
  return <div className={styles.progress} aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }}/></div>;
}
