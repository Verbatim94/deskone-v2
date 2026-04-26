const requiredKeys = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
] as const;

type RequiredEnvKey = (typeof requiredKeys)[number];

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseProjectId: string;
  missingKeys: RequiredEnvKey[];
  isConfigured: boolean;
};

function readRequiredEnv(key: RequiredEnvKey) {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
}

const missingKeys = requiredKeys.filter((key) => readRequiredEnv(key).length === 0);

export const publicEnv: PublicEnv = {
  supabaseUrl: readRequiredEnv("VITE_SUPABASE_URL"),
  supabasePublishableKey: readRequiredEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
  supabaseProjectId: readRequiredEnv("VITE_SUPABASE_PROJECT_ID"),
  missingKeys,
  isConfigured: missingKeys.length === 0,
};
