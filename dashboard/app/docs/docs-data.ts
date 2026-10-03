export interface DocNavItem {
  id: string;
  title: string;
  href?: string;
  badge?: string;
  children?: DocNavItem[];
}

export interface NavSection {
  title: string;
  items: DocNavItem[];
}

export const DOC_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { id: "overview", title: "Introduction & Architecture" },
      { id: "why-makechurcheazy", title: "Why MakeChurchEazy?" },
      { id: "system-requirements", title: "System Requirements & Downloads" },
    ],
  },
  {
    title: "Step-by-Step Setup",
    items: [
      { id: "step-1-install-pair", title: "Step 1: Install & Pair Desktop App", badge: "Core" },
      { id: "step-2-obs-setup", title: "Step 2: OBS Studio Browser Source", badge: "Core" },
      { id: "step-3-scripture-engine", title: "Step 3: Scriptures & Bible Engine", badge: "Core" },
      { id: "step-4-lyrics-hymns", title: "Step 4: Lyrics & EasyWorship Import", badge: "Core" },
      { id: "step-5-lower-thirds", title: "Step 5: Animated Lower-Thirds & Themes", badge: "New" },
      { id: "step-6-mobile-stage", title: "Step 6: Mobile Remote & Stage Monitor" },
    ],
  },
  {
    title: "Broadcasting & OBS",
    items: [
      { id: "obs-alpha-transparency", title: "Alpha Transparency & CSS Overlays" },
      { id: "multi-screen-projection", title: "Dual Monitor & Projector Routing" },
      { id: "vmix-atem-ndi", title: "vMix, ATEM & NDI Workflows" },
    ],
  },
  {
    title: "Live Service Checklist",
    items: [
      { id: "sunday-morning-checklist", title: "Sunday Morning 5-Minute Checklist" },
      { id: "comparison-matrix", title: "Feature Comparison Matrix" },
      { id: "troubleshooting-faq", title: "Troubleshooting & Offline Fallback" },
    ],
  },
];

export const ON_THIS_PAGE = [
  { id: "overview", title: "Overview" },
  { id: "why-makechurcheazy", title: "How MakeChurchEazy Works" },
  { id: "step-1-install-pair", title: "Step 1: Install & Pair Desktop App" },
  { id: "step-2-obs-setup", title: "Step 2: Connect OBS Studio" },
  { id: "step-3-scripture-engine", title: "Step 3: Present Scriptures" },
  { id: "step-4-lyrics-hymns", title: "Step 4: Lyrics & EasyWorship Import" },
  { id: "step-5-lower-thirds", title: "Step 5: Animated Lower-Thirds" },
  { id: "step-6-mobile-stage", title: "Step 6: Mobile Remote Control" },
  { id: "comparison-matrix", title: "Comparison Matrix" },
  { id: "sunday-morning-checklist", title: "Sunday Morning Checklist" },
  { id: "troubleshooting-faq", title: "Troubleshooting & FAQs" },
];
