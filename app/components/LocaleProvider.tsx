"use client";

import { createContext, type Context, useContext, useEffect, useMemo, useState } from "react";
import type { Locale } from "../lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale:Locale) => void;
  // The request year, fixed on the server so server and client agree on "this year".
  currentYear: number;
};

// Vinext can hot-reload the provider and its consumers as separate module
// versions. Reusing one Context object in development prevents a refreshed
// consumer from disconnecting from the still-mounted provider.
const localeGlobal = globalThis as typeof globalThis & {
  __flightLogLocaleContext?: Context<LocaleContextValue | null>;
};
const LocaleContext = localeGlobal.__flightLogLocaleContext
  ?? createContext<LocaleContextValue | null>(null);
if (process.env.NODE_ENV !== "production") {
  localeGlobal.__flightLogLocaleContext = LocaleContext;
}

export default function LocaleProvider({ children, initialLocale, currentYear }: { children:React.ReactNode; initialLocale:Locale; currentYear:number }) {
  const [locale,setLocale]=useState<Locale>(initialLocale);
  useEffect(()=>{
    document.documentElement.lang=locale;
    window.localStorage.setItem("flight-atlas-locale",locale);
    document.cookie=`flight-atlas-locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  },[locale]);
  const value=useMemo(()=>({locale,setLocale,currentYear}),[locale,currentYear]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(){
  const value=useContext(LocaleContext);
  if(!value)throw new Error("useLocale must be used within LocaleProvider");
  return value;
}
