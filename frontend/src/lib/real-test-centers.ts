export interface RealTestCenter {
  site_id: number;
  test_center_id: number;
  name: string;
  city: string;
}

export const REAL_TEST_CENTERS: Record<string, RealTestCenter[]> = {
  Rajshahi: [
    { site_id: 265, test_center_id: 265, name: "Joypurhat Technical Training Center", city: "Rajshahi" },
    { site_id: 201, test_center_id: 201, name: "Pabna Technical Training Centre", city: "Rajshahi" },
    { site_id: 168, test_center_id: 168, name: "Chapainawabganj Technical Training Centre", city: "Rajshahi" },
    { site_id: 107, test_center_id: 107, name: "Bogura Technical Training Centre", city: "Rajshahi" },
    { site_id: 54, test_center_id: 54, name: "Rajshahi Technical Training Centre", city: "Rajshahi" },
  ],
  Dhaka: [
    { site_id: 223, test_center_id: 223, name: "Manikganj Technical Training Center", city: "Dhaka" },
    { site_id: 221, test_center_id: 221, name: "Shariatpur Technical Training Centre", city: "Dhaka" },
    { site_id: 220, test_center_id: 220, name: "Kishoreganj Technical Training Centre", city: "Dhaka" },
    { site_id: 218, test_center_id: 218, name: "Narsingdi Technical Training Center", city: "Dhaka" },
    { site_id: 115, test_center_id: 115, name: "BRTC Central Training Institute Gazipur", city: "Dhaka" },
    { site_id: 102, test_center_id: 102, name: "Tangail Technical Training Center", city: "Dhaka" },
    { site_id: 45, test_center_id: 45, name: "Bangladesh German TTC", city: "Dhaka" },
    { site_id: 17, test_center_id: 17, name: "Bangladesh Korea TTC Dhaka", city: "Dhaka" },
  ],
  Khulna: [
    { site_id: 181, test_center_id: 181, name: "Narail Technical Training Centre", city: "Khulna" },
    { site_id: 171, test_center_id: 171, name: "Jashore Technical Training Centre", city: "Khulna" },
    { site_id: 156, test_center_id: 156, name: "Khulna Technical Training Centre", city: "Khulna" },
  ],
  Cumilla: [
    { site_id: 203, test_center_id: 203, name: "Noakhali Technical Training Centre", city: "Cumilla" },
    { site_id: 174, test_center_id: 174, name: "Brahmanbaria Technical Training Centre", city: "Cumilla" },
    { site_id: 62, test_center_id: 62, name: "Cumilla Technical Training Centre", city: "Cumilla" },
  ],
  Sylhet: [
    { site_id: 71, test_center_id: 71, name: "Sylhet Technical Training Center", city: "Sylhet" },
  ],
};

export const ALL_CITIES = Object.keys(REAL_TEST_CENTERS);

export function getCentersByCity(city: string): RealTestCenter[] {
  return REAL_TEST_CENTERS[city] || [];
}

export function getCenterBySiteId(siteId: number): RealTestCenter | undefined {
  for (const city of ALL_CITIES) {
    const center = REAL_TEST_CENTERS[city].find((c) => c.site_id === siteId);
    if (center) return center;
  }
  return undefined;
}

export function getCenterByTestCenterId(testCenterId: number): RealTestCenter | undefined {
  for (const city of ALL_CITIES) {
    const center = REAL_TEST_CENTERS[city].find((c) => c.test_center_id === testCenterId);
    if (center) return center;
  }
  return undefined;
}

export function getCenterByName(name: string): RealTestCenter | undefined {
  for (const city of ALL_CITIES) {
    const center = REAL_TEST_CENTERS[city].find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (center) return center;
  }
  return undefined;
}

export function searchCenters(query: string): RealTestCenter[] {
  const results: RealTestCenter[] = [];
  const lowerQuery = query.toLowerCase();
  for (const city of ALL_CITIES) {
    for (const center of REAL_TEST_CENTERS[city]) {
      if (
        center.name.toLowerCase().includes(lowerQuery) ||
        center.city.toLowerCase().includes(lowerQuery)
      ) {
        results.push(center);
      }
    }
  }
  return results;
}

export function getRealTestCenterNameById(id: number | string): string | undefined {
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return getCenterBySiteId(num)?.name || getCenterByTestCenterId(num)?.name;
}
