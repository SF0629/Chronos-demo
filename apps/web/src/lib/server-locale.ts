import { cookies } from "next/headers";
import type { Locale } from "./locale";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("chronos_locale")?.value;
  return value === "ko" ? "ko" : "en";
}
