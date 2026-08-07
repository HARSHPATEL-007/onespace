/**
 * N0VA1O Usage Forecasting — product & monetization (spec §7.1).
 *
 * Forecasts API calls, sandbox time, active accounts, and recipe executions so
 * tenants can avoid quota exhaustion. Forecasts are visible before limits.
 */

export interface UsageHistory {
  dailyApiCalls: number[];
  dailySandboxMinutes: number[];
  dailyActiveAccounts: number[];
  dailyRecipeExecutions: number[];
}

export interface Forecast {
  metric: string;
  current: number;
  forecasted: number;
  trend: "increasing" | "stable" | "decreasing";
  daysToExhaustion: number | null;
  willExceedLimit: boolean;
}

export interface UsageForecasts {
  apiCalls: Forecast;
  sandboxMinutes: Forecast;
  activeAccounts: Forecast;
  recipeExecutions: Forecast;
}

/**
 * Forecast usage from historical daily data using a simple linear trend.
 * Returns per-metric forecasts with days-to-exhaustion against a quota limit.
 */
export function forecastUsage(history: UsageHistory, limits: { apiCalls: number; sandboxMinutes: number; activeAccounts: number; recipeExecutions: number }): UsageForecasts {
  return {
    apiCalls: forecastMetric("API Calls", history.dailyApiCalls, limits.apiCalls),
    sandboxMinutes: forecastMetric("Sandbox Minutes", history.dailySandboxMinutes, limits.sandboxMinutes),
    activeAccounts: forecastMetric("Active Accounts", history.dailyActiveAccounts, limits.activeAccounts),
    recipeExecutions: forecastMetric("Recipe Executions", history.dailyRecipeExecutions, limits.recipeExecutions),
  };
}

function forecastMetric(name: string, daily: number[], limit: number): Forecast {
  if (daily.length === 0) {
    return { metric: name, current: 0, forecasted: 0, trend: "stable", daysToExhaustion: null, willExceedLimit: false };
  }
  const trendSlope = linearSlope(daily);
  const current = daily[daily.length - 1] ?? 0;
  const forecasted = Math.max(0, current + trendSlope * 7); // 7-day forecast
  const trend = trendSlope > 0.05 ? "increasing" : trendSlope < -0.05 ? "decreasing" : "stable";

  let daysToExhaustion: number | null = null;
  if (trendSlope > 0 && current > 0) {
    daysToExhaustion = Math.ceil(limit / (current + trendSlope));
  }
  const willExceedLimit = forecasted > limit || (daysToExhaustion !== null && daysToExhaustion <= 14);

  return { metric: name, current: Math.round(current), forecasted: Math.round(forecasted), trend, daysToExhaustion, willExceedLimit };
}

/** Simple linear regression slope. */
function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}
