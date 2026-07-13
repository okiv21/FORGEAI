import { supabase } from "./supabase";

/** A saved run. `code_refs` holds every agent's output keyed by agent id. */
export type ProjectRow = {
  id: string;
  idea: string;
  prd: string | null;
  db_schema: string | null;
  code_refs: Record<string, string>;
  created_at: string;
};

export async function listProjects(): Promise<ProjectRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("id,idea,prd,db_schema,code_refs,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ProjectRow[];
}

export async function renameProject(id: string, idea: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("projects").update({ idea }).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}
