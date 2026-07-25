"use client";

import { NextIntlClientProvider } from "next-intl";
import { ReactNode } from "react";
import { DEFAULT_LOCALE } from "./routing";

interface I18nProviderProps {
  children: ReactNode;
  locale?: string;
  messages?: Record<string, unknown>;
  timeZone?: string;
}

export default function I18nProvider({
  children,
  locale = DEFAULT_LOCALE,
  messages,
  timeZone = "UTC",
}: I18nProviderProps) {
  if (!messages) return <>{children}</>;

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  );
}
