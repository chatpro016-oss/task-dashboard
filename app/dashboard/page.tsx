import Link from "next/link";
import { redirect } from "next/navigation";
import TaskAddFormClient from "../../components/TaskAddFormClient";
import { deleteTaskAction, signOutAction } from "./actions";
import { getSupabaseServerClientReadOnly } from "../../lib/supabase/server";

type TaskRow = {
  id: string;
  user_id: string;
  text: string;
  image_url: string | null;
  created_at: string;
};

type ProfileRow = { user_id: string; email: string | null };

export default async function DashboardPage(props: { searchParams: any }) {
  const supabase = await getSupabaseServerClientReadOnly();
  if (!supabase) {
    return (
      <main className="container">
        <div className="card card-pad">
          <div className="alert alert-error">Missing Supabase env vars.</div>
        </div>
      </main>
    );
  }

  const { data: uData } = await supabase.auth.getUser();
  const user = uData.user;
  if (!user) redirect("/login");

  const { data: adminRow } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = !!adminRow;
  const sp = await Promise.resolve(props.searchParams);
  const viewMode: "mine" | "all" = isAdmin && sp?.view === "all" ? "all" : "mine";

  let q = supabase
    .from("tasks")
    .select("id,user_id,text,image_url,created_at")
    .order("created_at", { ascending: false });

  if (viewMode === "mine") q = q.eq("user_id", user.id);

  const { data: tasks, error: tErr } = await q;
  if (tErr) {
    return (
      <main className="container">
        <div className="card card-pad">
          <div className="alert alert-error">{tErr.message}</div>
        </div>
      </main>
    );
  }

  const rows = (tasks ?? []) as TaskRow[];

  let profilesMap: Record<string, string> = {};
  if (isAdmin && viewMode === "all") {
    const userIds = Array.from(new Set(rows.map((t) => t.user_id)));
    if (userIds.length) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id,email")
        .in("user_id", userIds);

      (prof as ProfileRow[] | null)?.forEach((p) => {
        profilesMap[p.user_id] = p.email ?? "";
      });
    }
  }

  const returnTo = isAdmin && viewMode === "all" ? "/dashboard?view=all" : "/dashboard";

  return (
    <main className="container">
      <header className="card topbar">
        <div className="title">
          <div className="kicker">Dashboard {isAdmin ? "(Admin)" : ""}</div>
          <div className="h1">{user.email}</div>
          {isAdmin ? <div className="subtle">Admin can view/edit/delete all users tasks.</div> : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {isAdmin ? (
            <>
              <Link className="btn btn-ghost" href="/dashboard">
                My tasks
              </Link>
              <Link className="btn btn-ghost" href="/dashboard?view=all">
                All tasks
              </Link>
            </>
          ) : null}

          <a className="btn btn-ghost" href={returnTo}>
            Refresh
          </a>

          <form action={signOutAction}>
            <button className="btn" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div style={{ height: 14 }} />

      <section className="card card-pad">
        <div className="title" style={{ marginBottom: 10 }}>
          <div className="kicker">Create</div>
          <div className="h2">Add a task</div>
        </div>
        <TaskAddFormClient />
      </section>

      <div style={{ height: 14 }} />

      <section className="card card-pad">
        <div className="title">
          <div className="kicker">Tasks</div>
          <div className="h2">{viewMode === "all" ? `All tasks (${rows.length})` : `Your tasks (${rows.length})`}</div>
        </div>

        <div className="list">
          {rows.length === 0 ? <div className="subtle">No tasks yet.</div> : null}

          {rows.map((t) => {
            const ownerLabel =
              viewMode === "all" ? profilesMap[t.user_id] || `${t.user_id.slice(0, 8)}…` : "";

            const editHref =
              `/dashboard/edit/${t.id}?returnTo=` + encodeURIComponent(returnTo);

            return (
              <div className="item" key={t.id}>
                <div className="item-row">
                  <div className="thumb-sm">
                    {t.image_url ? (
                      <a href={t.image_url} target="_blank" rel="noreferrer">
                        <img src={t.image_url} alt="" loading="lazy" />
                      </a>
                    ) : (
                      <span className="subtle">—</span>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div className="item-title">{t.text}</div>
                    <div className="subtle" style={{ marginTop: 2 }}>
                      {new Date(t.created_at).toLocaleString()}
                      {viewMode === "all" ? ` • User: ${ownerLabel}` : ""}
                    </div>
                  </div>

                  <div className="item-actions">
                    <Link className="btn btn-ghost" href={editHref}>
                      Edit
                    </Link>

                    <form action={deleteTaskAction}>
                      <input type="hidden" name="taskId" value={t.id} />
                      <button className="btn btn-danger" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}