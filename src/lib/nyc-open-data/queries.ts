import { queryOptions } from "@tanstack/react-query";
import { getNeighborhoodStats, getRecentApprovals, getDobSeasonality } from "./dob-permits.functions";
import { getDcwpCategories, getDcwpPermitsForCategory, getDcwpSeasonalityForCategory } from "./dcwp-licenses.functions";


export const neighborhoodStatsQuery = queryOptions({
  queryKey: ["nyc-open-data", "dob", "neighborhood-stats"],
  queryFn: () => getNeighborhoodStats(),
  staleTime: 60 * 60 * 1000, // 1h — dataset updates daily
  gcTime: 6 * 60 * 60 * 1000,
});

export function recentApprovalsQuery(input: { workType?: string; zip?: string; limit?: number } = {}) {
  return queryOptions({
    queryKey: ["nyc-open-data", "dob", "recent-approvals", input],
    queryFn: () => getRecentApprovals({ data: input }),
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export const dcwpCategoriesQuery = queryOptions({
  queryKey: ["nyc-open-data", "dcwp", "categories"],
  queryFn: () => getDcwpCategories(),
  staleTime: 6 * 60 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
});

export function dcwpPermitsForCategoryQuery(category: string) {
  return queryOptions({
    queryKey: ["nyc-open-data", "dcwp", "permits", category],
    queryFn: () => getDcwpPermitsForCategory({ data: { category } }),
    enabled: !!category,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
