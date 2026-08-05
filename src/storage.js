import { supabase } from "./supabaseClient.js";

// Drop-in replacement for the Claude-artifact window.storage API, backed by
// a single Supabase table. Every key is one row: { key, value }.
// This app only ever uses one key (see STORAGE_KEY in App.jsx), holding the
// entire app state as a JSON string, so writes stay cheap and simple.

export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from("kv_store")
      .select("key, value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { key: data.key, value: data.value };
  },

  async set(key, value) {
    const { data, error } = await supabase
      .from("kv_store")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select()
      .maybeSingle();
    if (error) throw error;
    return { key, value };
  },

  async delete(key) {
    const { error } = await supabase.from("kv_store").delete().eq("key", key);
    if (error) throw error;
    return { key, deleted: true };
  },
};
