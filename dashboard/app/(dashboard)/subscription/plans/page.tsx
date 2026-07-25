"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

const NewPricingPage = dynamic(
  () => import("./new_plans_page/NewDashboardPricingPlan"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center">
        <span className="animate-spin w-6 h-6 border-2 border-[#7C3AED] border-t-transparent rounded-full" />
      </div>
    ),
  }
);

export default function ChangePlanPage() {
  useEffect(() => {
    if (!document.querySelector('link[href*="Material+Symbols"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[src*="paystack"]')) {
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  return <NewPricingPage />;
}
