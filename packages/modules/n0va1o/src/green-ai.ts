/**
 * N0VA1O Green AI — energy-efficient inference and carbon accounting (spec §33).
 *
 * Provides carbon accounting, model optimization recommendations, and scheduling
 * for renewable energy alignment. Tracks per-query and per-model carbon impact.
 */

export interface CarbonMetrics {
  perQueryCarbonGrams: number;
  trainingCarbonKg: number;
  totalAnnualCarbonTons: number;
  renewablePercent: number;
  carbonIntensityGramsPerKwh: number;
  predictedVsBaseline: number;
  recommendations: string[];
}

export interface ModelEfficiency {
  modelId: string;
  parametersB: number;
  typicalLatencyMs: number;
  powerDrawKw: number;
  carbonPerQueryMg: number;
  quantization: "fp16" | "int8" | "int4" | "fp4";
  efficiencyScore: number;
}

export interface GreenProfile {
  modelId: string;
  quantization: "fp16" | "int8" | "int4" | "fp4";
  batching: boolean;
  continuousBatching: boolean;
  kvCacheReuse: boolean;
  speculativeDecoding: boolean;
  flashAttention: boolean;
  carbonSaved: number;
}

export interface RenewableForecast {
  timestamp: string;
  renewablePercent: number;
  carbonIntensity: number;
  recommendedAction: "max_compute" | "conserve" | "shift_load";
}

const MODEL_DATABASE: Record<string, ModelEfficiency> = {
  "n0va-lm-405b": {
    modelId: "n0va-lm-405b",
    parametersB: 405,
    typicalLatencyMs: 1200,
    powerDrawKw: 7.0,
    carbonPerQueryMg: 4.2,
    quantization: "fp16",
    efficiencyScore: 0.72,
  },
  "n0va-lm-70b-q8": {
    modelId: "n0va-lm-70b-q8",
    parametersB: 70,
    typicalLatencyMs: 420,
    powerDrawKw: 3.5,
    carbonPerQueryMg: 1.5,
    quantization: "int8",
    efficiencyScore: 0.85,
  },
  "n0va-lm-8b-q4": {
    modelId: "n0va-lm-8b-q4",
    parametersB: 8,
    typicalLatencyMs: 120,
    powerDrawKw: 1.2,
    carbonPerQueryMg: 0.38,
    quantization: "int4",
    efficiencyScore: 0.94,
  },
};

/**
 * Compute carbon metrics for the workspace.
 */
export function computeCarbonMetrics(input: {
  dailyQueryVolume: number;
  monthlyTrainingJobs: number;
  trainingHours: number;
  modelDistribution: Record<string, number>;
  renewablePercent: number;
  carbonIntensityGramsPerKwh: number;
}): CarbonMetrics {
  const { dailyQueryVolume, trainingHours, modelDistribution, carbonIntensityGramsPerKwh, renewablePercent } = input;

  let perQueryCarbon = 0;
  for (const [modelId, share] of Object.entries(modelDistribution)) {
    const model = MODEL_DATABASE[modelId];
    if (model) {
      perQueryCarbon += model.carbonPerQueryMg * share * carbonIntensityGramsPerKwh / 45;
    }
  }

  const trainingCarbon = trainingHours * 5.0 * carbonIntensityGramsPerKwh / 1000;
  const dailyCarbon = (perQueryCarbon * dailyQueryVolume) / 1000;
  const annualTons = ((dailyCarbon * 365) / 1_000_000) * (1 - renewablePercent / 100);

  const baselineTons = annualTons * 1.35;
  const recommendations = generateGreenRecommendations(input);

  return {
    perQueryCarbonGrams: perQueryCarbon / 1000,
    trainingCarbonKg: trainingCarbon,
    totalAnnualCarbonTons: annualTons,
    renewablePercent,
    carbonIntensityGramsPerKwh,
    predictedVsBaseline: annualTons / baselineTons,
    recommendations,
  };
}

/**
 * Recommend model routing for energy efficiency.
 */
export function recommendRouting(queryComplexity: "simple" | "complex", urgency: "high" | "low"): { modelId: string; expectedCarbonMg: number; latencyMs: number } {
  if (queryComplexity === "simple" && urgency === "low") {
    return { modelId: "n0va-lm-8b-q4", expectedCarbonMg: 1.8, latencyMs: 120 };
  }
  if (queryComplexity === "simple") {
    return { modelId: "n0va-lm-70b-q8", expectedCarbonMg: 3.2, latencyMs: 420 };
  }
  if (urgency === "high") {
    return { modelId: "n0va-lm-405b", expectedCarbonMg: 4.2, latencyMs: 1200 };
  }
  return { modelId: "n0va-lm-70b-q8", expectedCarbonMg: 3.2, latencyMs: 420 };
}

/**
 * Generate a green optimization profile for a model.
 */
export function generateGreenProfile(modelId: string): GreenProfile | null {
  const model = MODEL_DATABASE[modelId];
  if (!model) return null;

  const optimizations = optimizeModel(model);
  const carbonSaved = model.carbonPerQueryMg * 0.35;

  return {
    modelId,
    quantization: optimizations.bestQuant,
    batching: true,
    continuousBatching: true,
    kvCacheReuse: true,
    speculativeDecoding: model.parametersB > 50,
    flashAttention: model.parametersB > 100,
    carbonSaved,
  };
}

/**
 * Forecast renewable energy availability for job scheduling.
 */
export function forecastRenewable(
  hours: number,
  currentRenewable: number,
  currentCarbon: number,
): RenewableForecast[] {
  const forecasts: RenewableForecast[] = [];
  const now = new Date();

  for (let h = 0; h < hours; h++) {
    const hour = new Date(now.getTime() + h * 3_600_000);
    const cycle = Math.sin((h / 24) * Math.PI * 2);
    const dayFactor = hour.getHours() >= 8 && hour.getHours() <= 18 ? 1.0 : 0.6;
    const renewable = Math.max(20, Math.min(100, currentRenewable + cycle * 15 * dayFactor));
    const carbon = currentCarbon * (1 - (renewable - currentRenewable) / 200);

    let action: RenewableForecast["recommendedAction"] = "conserve";
    if (renewable > 80 && carbon < currentCarbon * 0.8) action = "max_compute";
    else if (renewable > 60) action = "shift_load";

    forecasts.push({
      timestamp: hour.toISOString(),
      renewablePercent: Math.round(renewable),
      carbonIntensity: Math.round(carbon),
      recommendedAction: action,
    });
  }

  return forecasts;
}

function optimizeModel(model: ModelEfficiency): { bestQuant: ModelEfficiency["quantization"]; techniques: string[] } {
  const techniques: string[] = [];

  if (model.parametersB > 100) {
    techniques.push("FlashAttention-3");
    techniques.push("TensorRT-LLM");
  }
  if (model.parametersB > 50) {
    techniques.push("Speculative Decoding");
  }
  if (model.parametersB > 20) {
    techniques.push("Continuous Batching");
  }
  techniques.push("KV Cache Optimization");

  let bestQuant: ModelEfficiency["quantization"] = model.quantization;
  if (model.efficiencyScore < 0.8 && model.quantization === "fp16") bestQuant = "int8";
  if (model.efficiencyScore < 0.7 && model.quantization === "int8") bestQuant = "int4";

  return { bestQuant, techniques };
}

function generateGreenRecommendations(input: {
  dailyQueryVolume: number;
  monthlyTrainingJobs: number;
  trainingHours: number;
  modelDistribution: Record<string, number>;
  renewablePercent: number;
  carbonIntensityGramsPerKwh: number;
}): string[] {
  const recs: string[] = [];

  const smallModelShare = (input.modelDistribution["n0va-lm-8b-q4"] ?? 0) + (input.modelDistribution["n0va-lm-70b-q8"] ?? 0);
  if (smallModelShare < 0.6) {
    recs.push("Route 60% of simple queries through 8B/70B quantized models to reduce carbon by 45%");
  }

  if (input.trainingHours > 5000 && input.carbonIntensityGramsPerKwh > 400) {
    recs.push("Shift training workloads to off-peak hours when renewable energy is abundant");
  }

  if (input.renewablePercent < 50) {
    recs.push("Purchase renewable energy credits to offset compute carbon footprint (target 100% renewable)");
  }

  if (input.monthlyTrainingJobs > 20) {
    recs.push("Implement early stopping + model distillation to reduce training compute by 30%");
  }

  return recs;
}
