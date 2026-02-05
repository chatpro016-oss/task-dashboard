import { redirect } from "next/navigation";
import { getSupabaseServerClientReadOnly } from "../../lib/supabase/server";

export default async function AdminPage() {
  const supabase = await getSupabaseServerClientReadOnly();
  if (!supabase) redirect("/dashboard");

  const { data: uData } = await supabase.auth.getUser();
  const user = uData.user;
  if (!user) redirect("/login");

  const { data: adminRow } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) redirect("/dashboard");

  redirect("/dashboard?view=all");
}