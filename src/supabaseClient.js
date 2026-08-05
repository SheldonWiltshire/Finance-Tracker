import { createClient } from "@supabase/supabase-js";

// Fill these in from your Supabase project: Settings -> API
// (same place you got the values for Sheldon Actions).
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
