import { redirect } from "next/navigation";
import TaskEditFormClient from "../../../../components/TaskEditFormClient";
import { getSupabaseServerClientReadOnly } from "../../../../lib/supabase/server";

export default async function EditTaskPage(props: { params: any; searchParams: any }) {
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
  if (!uData.user) redirect("/login");

  // ✅ Works if params/searchParams are objects OR Promises
  const p = await Promise.resolve(props.params);
  const sp = await Promise.resolve(props.searchParams);

  const id = p?.id as string | undefined;
  const returnTo = (sp?.returnTo as string | undefined) || "/dashboard";

  if (!id) {
    return (
      <main className="container">
        <div className="card card-pad">
          <div className="alert alert-error">Missing task id in route.</div>
        </div>
      </main>
    );
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .select("id,text,image_url,created_at")
    .eq("id", id)
    .single();

  if (error) {
    return (
      <main className="container">
        <div className="card card-pad">
          <div className="alert alert-error">{error.message}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ maxWidth: 980 }}>
      <header className="card topbar">
        <div className="title">
          <div className="kicker">Edit</div>
          <div className="h1">Edit Task</div>
        </div>
        <a className="btn btn-ghost" href={returnTo}>
          Back
        </a>
      </header>

      <div style={{ height: 14 }} />

      <section className="card card-pad">
        <TaskEditFormClient
          taskId={task.id}
          initialText={task.text}
          currentImageUrl={task.image_url}
          returnTo={returnTo}
        />
      </section>
    </main>
  );
}