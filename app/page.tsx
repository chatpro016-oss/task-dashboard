"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) router.replace("/dashboard");
      else router.replace("/login");
    })();
  }, [router]);

  return <div style={{ padding: 16 }}>Loading…</div>;
}