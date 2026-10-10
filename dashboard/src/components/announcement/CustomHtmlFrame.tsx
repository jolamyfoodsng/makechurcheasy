"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Shows admin-written announcement HTML in a sandboxed frame.
 *
 * - The frame has no access to the app: it runs in an opaque origin, cannot
 *   navigate the page and cannot open windows.
 * - Scripts the admin writes are removed by the API. The only script that runs
 *   is the small one added below, which reports link clicks and the content
 *   height to the app so links can be tracked and opened by the app itself.
 */

const BRIDGE_SOURCE = "mce-announcement";

const BRIDGE_SCRIPT = `(function(){
  function post(message){ message.source = "${BRIDGE_SOURCE}"; parent.postMessage(message, "*"); }
  document.addEventListener("click", function(event){
    var el = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!el) return;
    event.preventDefault();
    post({ type: "link", href: el.getAttribute("href") || "" });
  }, true);
  function resize(){ post({ type: "resize", height: Math.ceil(document.documentElement.scrollHeight) }); }
  window.addEventListener("load", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.documentElement);
  resize();
})();`;

function buildDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937;background:#fff;overflow-wrap:anywhere}a{cursor:pointer}img{max-width:100%;height:auto}</style></head><body>${html}<script>${BRIDGE_SCRIPT}</script></body></html>`;
}

/** Same rule the API applies to buttons: web links, mailto and in-app paths only. */
export function isSafeAnnouncementHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return true;
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

export function CustomHtmlFrame({
  html,
  onLinkClick,
  minHeight = 120,
  maxHeight = 460,
  className,
}: {
  html: string;
  /** Called with a link the viewer clicked inside the HTML (already checked as safe). */
  onLinkClick?: (href: string) => void;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);
  const srcDoc = useMemo(() => buildDocument(html), [html]);
  const onLinkRef = useRef(onLinkClick);
  onLinkRef.current = onLinkClick;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; href?: unknown; height?: unknown } | null;
      if (!data || data.source !== BRIDGE_SOURCE) return;
      if (data.type === "resize" && typeof data.height === "number" && Number.isFinite(data.height)) {
        setHeight(Math.max(minHeight, Math.min(maxHeight, Math.ceil(data.height))));
      } else if (data.type === "link" && typeof data.href === "string" && isSafeAnnouncementHref(data.href)) {
        onLinkRef.current?.(data.href.trim());
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [minHeight, maxHeight]);

  return (
    <iframe
      ref={frameRef}
      title="Announcement content"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className={className}
      style={{ width: "100%", height, border: 0, display: "block", background: "#fff" }}
    />
  );
}
