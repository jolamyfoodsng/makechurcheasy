import { NextResponse } from "next/server";
import { getCountries, upsertCountries } from "@/lib/db";
import type { Country } from "@/types/schemas";

/**
 * GET /api/countries
 *
 * Public endpoint — returns all countries sorted by name.
 * If the collection is empty, auto-seeds from the countriesnow.space API.
 */
export async function GET() {
  try {
    let countries = await getCountries();

    // Auto-seed on first request
    if (countries.length === 0) {
      await seedCountries();
      countries = await getCountries();
    }

    return NextResponse.json(countries);
  } catch (error) {
    console.error("Get countries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/countries
 *
 * Re-seeds the countries collection from the remote API.
 * Can be called manually to refresh the data.
 */
export async function POST() {
  try {
    const count = await seedCountries();
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Seed countries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function seedCountries(): Promise<number> {
  const res = await fetch("https://countriesnow.space/api/v0.1/countries/flag/images");
  if (!res.ok) throw new Error(`Failed to fetch countries: ${res.status}`);

  const data = await res.json();
  const raw: { name: string; flag: string; iso2: string; iso3: string }[] = data.data ?? [];

  const countries: Omit<Country, "_id">[] = raw.map((c) => ({
    name: c.name,
    iso2: c.iso2.toUpperCase(),
    iso3: c.iso3.toUpperCase(),
    flag: c.flag || "",
    region: "",
    subregion: "",
  }));

  return upsertCountries(countries);
}
