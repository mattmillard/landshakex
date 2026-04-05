function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : null;
}

export const env = {
  maptilerStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://demotiles.maplibre.org/style.json",
  appName: "LandShakeX",
  supabaseUrl: optionalEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: optionalEnv("SUPABASE_SERVICE_ROLE_KEY")
};
