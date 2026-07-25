import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, getLocaleCandidates, resolveLocalePreference } from "./routing";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const acceptLanguage = headerStore.get("accept-language");
  const locale = resolveLocalePreference(localeCookie, undefined, acceptLanguage) || DEFAULT_LOCALE;

  let messages: Record<string, unknown> | undefined;
  for (const candidate of getLocaleCandidates(locale)) {
    try {
      messages = (await import(`../locales/${candidate}.json`)).default;
      break;
    } catch {
      // try the next fallback locale
    }
  }

  if (!messages) {
    messages = (await import("../locales/en.json")).default;
  }

  return {
    locale,
    messages,
    timeZone: "UTC",
  };
});
