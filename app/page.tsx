"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";

export default function HomePage() {
  const router = useRouter();

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
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
      router.replace(data.user ? "/dashboard" : "/login");
    })();
  }, [router, supabase]);

  return (
    <main className="container">
      <div className="card card-pad">Loading…</div>
    </main>
  );
}