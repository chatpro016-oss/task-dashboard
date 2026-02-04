"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

export default function AdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [error, setError] = useState("");

  if (!supabase) {
    return (
      <main className="container">
        <div className="card card-pad">
          <div className="alert alert-error">
            Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </div>
        </div>
      </main>
    );
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      const { data: adminRow, error } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (error) {
        setError(error.message);
        return;
      }

      if (!adminRow) {
        router.replace("/dashboard");
        return;
      }

      // Admin UX: just use dashboard "All tasks" mode
      router.replace("/dashboard");
    })();
  }, [router, supabase]);

  return (
    <main className="container">
      <div className="card card-pad">
        {error ? <div className="alert alert-error">{error}</div> : null}
        Loading admin…
      </div>
    </main>
  );
}