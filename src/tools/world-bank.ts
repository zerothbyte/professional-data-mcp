import { httpGet } from "../utils/http.js";

const WB_BASE = "https://api.worldbank.org/v2";

// Common indicator codes
const INDICATOR_MAP: Record<string, string> = {
  gdp: "NY.GDP.MKTP.CD",
  gdp_per_capita: "NY.GDP.PCAP.CD",
  gdp_growth: "NY.GDP.MKTP.KD.ZG",
  population: "SP.POP.TOTL",
  inflation: "FP.CPI.TOTL.ZG",
  unemployment: "SL.UEM.TOTL.ZS",
  poverty_rate: "SI.POV.DDAY",
  literacy_rate: "SE.ADT.LITR.ZS",
  life_expectancy: "SP.DYN.LE00.IN",
  exports: "NE.EXP.GNFS.CD",
  imports: "NE.IMP.GNFS.CD",
  fdi: "BX.KLT.DINV.CD.WD",
  gini: "SI.POV.GINI",
  co2_emissions: "EN.ATM.CO2E.PC",
  internet_users: "IT.NET.USER.ZS",
};

// ── Tool Definitions ────────────────────────────────────────────────────────

export const worldBankToolDefs = [
  {
    name: "worldbank_get_indicator",
    description:
      "Get World Bank economic/social indicator data for one or more countries. Supports GDP, population, inflation, unemployment, poverty, literacy, life expectancy, trade, FDI, CO2, internet users, etc.",
    inputSchema: {
      type: "object",
      properties: {
        country_code: {
          type: "string",
          description:
            'ISO 3166-1 alpha-2 or alpha-3 country code, or "all" for all countries. Examples: ID, US, CN, IDN, all',
        },
        indicator: {
          type: "string",
          enum: Object.keys(INDICATOR_MAP),
          description: "Economic or social indicator to retrieve",
        },
        start_year: {
          type: "number",
          description: "Start year (default: 2015)",
          default: 2015,
        },
        end_year: {
          type: "number",
          description: "End year (default: current year)",
        },
      },
      required: ["country_code", "indicator"],
    },
  },
  {
    name: "worldbank_country_profile",
    description:
      "Get a comprehensive economic profile of a country: GDP, population, inflation, unemployment, life expectancy, internet penetration.",
    inputSchema: {
      type: "object",
      properties: {
        country_code: {
          type: "string",
          description: "ISO country code, e.g. ID (Indonesia), US, CN",
        },
        year: {
          type: "number",
          description: "Reference year (default: 2022)",
          default: 2022,
        },
      },
      required: ["country_code"],
    },
  },
  {
    name: "worldbank_search_countries",
    description: "List all World Bank countries with their codes and regions.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description:
            'Filter by region: EAS, ECS, LCN, MEA, NAC, SAS, SSF, or leave empty for all',
        },
      },
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

export async function handleWorldBank(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "worldbank_get_indicator":
      return getIndicator(
        args.country_code,
        args.indicator,
        args.start_year ?? 2015,
        args.end_year ?? new Date().getFullYear()
      );
    case "worldbank_country_profile":
      return getCountryProfile(args.country_code, args.year ?? 2022);
    case "worldbank_search_countries":
      return searchCountries(args.region);
    default:
      throw new Error(`Unknown World Bank tool: ${toolName}`);
  }
}

async function getIndicator(
  countryCode: string,
  indicator: string,
  startYear: number,
  endYear: number
): Promise<string> {
  const indicatorCode = INDICATOR_MAP[indicator];
  if (!indicatorCode) return `❌ Unknown indicator: ${indicator}`;

  const data = await httpGet<any[]>(
    `${WB_BASE}/country/${countryCode}/indicator/${indicatorCode}`,
    {
      format: "json",
      date: `${startYear}:${endYear}`,
      per_page: 100,
    }
  );

  const entries = data?.[1];
  if (!entries?.length) return `❌ No data found for ${indicator} in ${countryCode}`;

  const rows = entries
    .filter((e: any) => e.value !== null)
    .map((e: any) => ({
      country: e.country?.value,
      year: e.date,
      value: e.value,
      unit: e.unit || "",
    }))
    .sort((a: any, b: any) => Number(b.year) - Number(a.year));

  return JSON.stringify(
    { indicator, indicatorCode, data: rows },
    null,
    2
  );
}

async function getCountryProfile(countryCode: string, year: number): Promise<string> {
  const indicators = [
    "gdp", "gdp_per_capita", "gdp_growth", "population",
    "inflation", "unemployment", "life_expectancy", "internet_users",
  ];

  const results: Record<string, any> = { country: countryCode, year };

  await Promise.all(
    indicators.map(async (ind) => {
      try {
        const code = INDICATOR_MAP[ind];
        const data = await httpGet<any[]>(
          `${WB_BASE}/country/${countryCode}/indicator/${code}`,
          { format: "json", date: `${year - 3}:${year}`, per_page: 10 }
        );
        const entries = data?.[1]?.filter((e: any) => e.value !== null) ?? [];
        if (entries.length) {
          results[ind] = entries[0]?.value;
        }
      } catch {
        // skip failed indicators
      }
    })
  );

  return JSON.stringify(results, null, 2);
}

async function searchCountries(region?: string): Promise<string> {
  const params: Record<string, any> = { format: "json", per_page: 300 };
  if (region) params.region = region;

  const data = await httpGet<any[]>(`${WB_BASE}/country`, params);
  const countries = (data?.[1] ?? [])
    .filter((c: any) => c.capitalCity) // exclude aggregates
    .map((c: any) => ({
      code: c.id,
      name: c.name,
      region: c.region?.value,
      income: c.incomeLevel?.value,
      capital: c.capitalCity,
    }));

  return JSON.stringify(countries, null, 2);
}
