export type SituationType =
  "crisis" | "focus" | "collaboration" | "teaching" | "executive";

export interface ToneProfile {
  verbosity: "minimal" | "concise" | "balanced" | "detailed";
  formality: "casual" | "neutral" | "formal";
  empathy: "low" | "medium" | "high";
  pace: "slow" | "normal" | "fast";
}

export class SituationalToneEngine {
  private profiles: Record<SituationType, ToneProfile> = {
    crisis: {
      verbosity: "concise",
      formality: "formal",
      empathy: "medium",
      pace: "fast",
    },
    focus: {
      verbosity: "minimal",
      formality: "neutral",
      empathy: "low",
      pace: "normal",
    },
    collaboration: {
      verbosity: "balanced",
      formality: "casual",
      empathy: "high",
      pace: "normal",
    },
    teaching: {
      verbosity: "detailed",
      formality: "neutral",
      empathy: "high",
      pace: "slow",
    },
    executive: {
      verbosity: "concise",
      formality: "formal",
      empathy: "low",
      pace: "fast",
    },
  };

  getProfile(situation: SituationType): ToneProfile {
    return this.profiles[situation];
  }

  adapt(baseProfile: ToneProfile, userStress: number): ToneProfile {
    if (userStress > 0.7) {
      return {
        ...baseProfile,
        verbosity: "concise",
        pace: "fast",
        empathy: "high",
      };
    }
    if (userStress < 0.3) {
      return { ...baseProfile, verbosity: "detailed", pace: "slow" };
    }
    return baseProfile;
  }
}
