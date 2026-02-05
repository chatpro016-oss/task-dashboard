import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anon };
}

// Server Components (read-only cookies)
export async function getSupabaseServerClientReadOnly() {
  const { url, anon } = getEnv();
  if (!url || !anon) return null;

  const cookieStore = await cookies(); // ✅ IMPORTANT (async in Next 15/16)

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // no-op in Server Components
      },
    },
  });
}

// Server Actions (can set cookies)
export async function getSupabaseServerClient() {
  const { url, anon } = getEnv();
  if (!url || !anon) return null;

  const cookieStore = await cookies(); // ✅ IMPORTANT

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}