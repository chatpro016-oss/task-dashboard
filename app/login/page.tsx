"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function LoginPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!url || !anon) throw new Error("Missing Supabase env vars");
    return createClient(url, anon);
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!email.trim() || !password.trim()) {
        setError("Email and password required.");
        return;
      }

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message);
      }

      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <div className="card-pad">
          <div className="title" style={{ gap: 6 }}>
            <div className="kicker">Supabase Auth</div>
            <h1 className="h2" style={{ fontSize: 20 }}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <div className="subtle">
              Email + password login. (If signup email rate-limit comes, create user from Supabase Dashboard → Auth → Users → Add user → Auto confirm.)
            </div>
          </div>

          <hr className="sep" />

          <form onSubmit={onSubmit} className="grid">
            <label className="label">
              <span>Email</span>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
              />
            </label>

            <label className="label">
              <span>Password</span>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
              />
            </label>

            {error ? <div className="alert alert-error">{error}</div> : null}

            <button className="btn btn-primary" disabled={loading} type="submit">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
            </button>

            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              disabled={loading}
            >
              {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}