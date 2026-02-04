"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

type TaskRow = {
  id: string;
  user_id: string;
  text: string;
  image_url: string | null;
  created_at: string;
};

const BUCKET = "task-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function safeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getObjectPathFromPublicUrl(imageUrl: string): string | null {
  try {
    const u = new URL(imageUrl);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(imageUrl.slice(idx + marker.length));
  }
}
export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return createClient(url, anon);
  }, []);
  const mountedRef = useRef(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewMode, setViewMode] = useState<"mine" | "all">("mine");
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editText, setEditText] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState("");
  const [removeEditImage, setRemoveEditImage] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Viewer (lightbox)
  const [viewerUrl, setViewerUrl] = useState<string>("");
  const [viewerTitle, setViewerTitle] = useState<string>("");

  function openViewer(url: string, title?: string) {
    if (!url) return;
    setViewerUrl(url);
    setViewerTitle(title || "Preview");
  }
  function closeViewer() {
    setViewerUrl("");
    setViewerTitle("");
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeViewer();
    }
    if (viewerUrl) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerUrl]);

  // Auth + admin 
  useEffect(() => {
    let unsub: { data?: { subscription?: { unsubscribe: () => void } } } | null = null;

    (async () => {
      setAuthLoading(true);
      setError("");

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr) setError(userErr.message);

      const u = data?.user;
      if (!u) {
        router.replace("/login");
        return;
      }

      setUserEmail(u.email ?? "");
      setUserId(u.id);

      const { data: adminRow, error: adminErr } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", u.id)
        .maybeSingle();

      if (adminErr) {
        setError(adminErr.message);
        setIsAdmin(false);
        setViewMode("mine");
      } else {
        const admin = !!adminRow;
        setIsAdmin(admin);
        setViewMode(admin ? "all" : "mine");
      }

      setAuthLoading(false);
    })();

    unsub = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (!u) {
        router.replace("/login");
        return;
      }
      setUserEmail(u.email ?? "");
      setUserId(u.id);
    });

    return () => unsub?.data?.subscription?.unsubscribe?.();
  }, [router, supabase]);

  async function loadTasks(uid: string, mode: "mine" | "all") {
    setTasksLoading(true);
    setError("");

    let q = supabase
      .from("tasks")
      .select("id,user_id,text,image_url,created_at")
      .order("created_at", { ascending: false });

    if (mode === "mine") q = q.eq("user_id", uid);

    const { data, error: selErr } = await q;
    if (selErr) setError(selErr.message);

    setTasks(data ?? []);
    setTasksLoading(false);
  }

  useEffect(() => {
    if (!userId) return;
    loadTasks(userId, viewMode);
  }, [userId, viewMode]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Edit preview
  useEffect(() => {
    if (!editFile) {
      setEditPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(editFile);
    setEditPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [editFile]);

  function validateImage(f: File) {
    if (!f.type.startsWith("image/")) throw new Error("Please choose an image file (jpg/png/webp/etc).");
    if (f.size > MAX_IMAGE_BYTES) throw new Error("Image is too large (max 5MB).");
  }

  async function uploadImage(targetUserId: string, f: File) {
    validateImage(f);

    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const objectName = `${targetUserId}/${safeId()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectName, f, {
      upsert: false,
      contentType: f.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
    return pub.publicUrl as string;
  }

  async function tryDeleteStorageByUrl(targetUserId: string, imageUrl: string) {
    const objectPath = getObjectPathFromPublicUrl(imageUrl);
    if (!objectPath || !objectPath.startsWith(`${targetUserId}/`)) return;

    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([objectPath]);
    if (rmErr) console.warn("Storage remove error:", rmErr.message);
  }

  async function onAddTask(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!userId) return;

    const trimmed = text.trim();
    if (!trimmed) {
      setError("Task text is required.");
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (file) imageUrl = await uploadImage(userId, file);

      const { error: insErr } = await supabase.from("tasks").insert({
        user_id: userId,
        text: trimmed,
        image_url: imageUrl,
      });
      if (insErr) throw new Error(insErr.message);

      setText("");
      setFile(null);
      setPreviewUrl("");

      await loadTasks(userId, viewMode);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  function startEdit(t: TaskRow) {
    setError("");
    setEditingId(t.id);
    setEditText(t.text);
    setEditFile(null);
    setEditPreviewUrl("");
    setRemoveEditImage(false);
  }

  function cancelEdit() {
    setEditingId("");
    setEditText("");
    setEditFile(null);
    setEditPreviewUrl("");
    setRemoveEditImage(false);
    setSavingEdit(false);
  }

  async function saveEdit(task: TaskRow) {
    if (!userId) return;
    setError("");

    const trimmed = editText.trim();
    if (!trimmed) {
      setError("Task text is required.");
      return;
    }

    setSavingEdit(true);
    try {
      // Owner of the task (very important for storage folder)
      const targetUserId = task.user_id;

      // undefined = keep, null = remove, string = replace
      let newImageUrl: string | null | undefined = undefined;

      if (editFile) newImageUrl = await uploadImage(targetUserId, editFile);
      else if (removeEditImage) newImageUrl = null;

      const payload: any = { text: trimmed };
      if (newImageUrl !== undefined) payload.image_url = newImageUrl;

      // Admin policy allows update for any row (if you ran SQL)
      const { error: upErr } = await supabase.from("tasks").update(payload).eq("id", task.id);

      if (upErr) throw new Error(upErr.message);

      // cleanup old image if replaced/removed
      if (task.image_url && newImageUrl !== undefined) {
        await tryDeleteStorageByUrl(targetUserId, task.image_url);
      }

      await loadTasks(userId, viewMode);
      cancelEdit();
    } catch (err: any) {
      setError(err?.message || "Update failed.");
    } finally {
      if (mountedRef.current) setSavingEdit(false);
    }
  }

  async function onDeleteTask(task: TaskRow) {
    if (!userId) return;
    setError("");

    const ok = window.confirm("Delete this task? (Image will also be deleted if it exists)");
    if (!ok) return;

    setDeletingId(task.id);

    try {
      const targetUserId = task.user_id;

      if (task.image_url) await tryDeleteStorageByUrl(targetUserId, task.image_url);

      // Admin policy allows delete for any row (if you ran SQL)
      const { error: delErr } = await supabase.from("tasks").delete().eq("id", task.id);

      if (delErr) throw new Error(delErr.message);

      if (editingId === task.id) cancelEdit();
      await loadTasks(userId, viewMode);
    } catch (err: any) {
      setError(err?.message || "Delete failed.");
    } finally {
      if (mountedRef.current) setDeletingId("");
    }
  }

  async function onSignOut() {
    setError("");
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (authLoading) {
    return (
      <main className="container">
        <div className="card card-pad" style={{ height: 88 }} />
        <div style={{ height: 14 }} />
        <div className="card card-pad" style={{ height: 180 }} />
        <div style={{ height: 14 }} />
        <div className="card card-pad" style={{ height: 340 }} />
      </main>
    );
  }

  return (
    <main className="container">
      {/* Viewer Modal */}
      {viewerUrl ? (
        <div className="viewerOverlay" onClick={(e) => e.target === e.currentTarget && closeViewer()} role="dialog" aria-modal="true">
          <div className="viewerModal">
            <div className="viewerTop">
              <div className="viewerTitle" title={viewerTitle}>
                {viewerTitle}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <a className="btn btn-ghost" href={viewerUrl} target="_blank" rel="noreferrer">
                  Open in new tab
                </a>
                <button className="btn" onClick={closeViewer}>
                  Close
                </button>
              </div>
            </div>
            <div className="viewerBody">
              <img className="viewerImg" src={viewerUrl} alt={viewerTitle || "Preview"} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Top */}
      <header className="card topbar">
        <div className="title">
          <div className="kicker">Dashboard {isAdmin ? "(Admin)" : ""}</div>
          <div className="h1" title={userEmail}>
            {userEmail}
          </div>
          {isAdmin ? <div className="subtle">Admin can view/edit/delete all users tasks.</div> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {isAdmin ? (
            <>
              <button className="btn btn-ghost" onClick={() => setViewMode("mine")} disabled={viewMode === "mine"}>
                My tasks
              </button>
              <button className="btn btn-ghost" onClick={() => setViewMode("all")} disabled={viewMode === "all"}>
                All tasks
              </button>
            </>
          ) : null}

          <button className="btn btn-ghost" onClick={() => userId && loadTasks(userId, viewMode)} disabled={tasksLoading}>
            {tasksLoading ? "Refreshing…" : "Refresh"}
          </button>

          <button className="btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div style={{ height: 14 }} />

      {/* Add */}
      <section className="card card-pad">
        <div className="title" style={{ marginBottom: 10 }}>
          <div className="kicker">Create</div>
          <div className="h2">Add a task</div>
        </div>

        <form onSubmit={onAddTask} className="grid">
          <label className="label">
            <span>Task</span>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your task…" />
          </label>

          <div className="row2">
            <div
              className={`thumb ${previewUrl ? "clickable" : ""}`}
              onClick={() => previewUrl && openViewer(previewUrl, "New image preview")}
              title={previewUrl ? "Click to open preview" : ""}
            >
              {previewUrl ? <img src={previewUrl} alt="Preview" /> : <span className="subtle">No image</span>}
            </div>

            <div className="grid" style={{ gap: 8 }}>
              <div className="subtle">
                Optional image upload (bucket: <b>{BUCKET}</b>)
              </div>
              <input className="input" style={{ padding: 10 }} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          {error ? <div className="alert alert-error">{error}</div> : null}

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add task"}
          </button>
        </form>
      </section>

      <div style={{ height: 14 }} />

      {/* List */}
      <section className="card card-pad">
        <div className="title">
          <div className="kicker">Tasks</div>
          <div className="h2">{viewMode === "all" ? `All tasks (${tasks.length})` : `Your tasks (${tasks.length})`}</div>
          <div className="subtle">Click image thumbnail to preview.</div>
        </div>

        <div className="list">
          {tasksLoading ? (
            <div className="subtle">Loading…</div>
          ) : tasks.length === 0 ? (
            <div className="subtle">No tasks yet.</div>
          ) : (
            tasks.map((t) => {
              const isEditing = editingId === t.id;
              const thumbUrl =
                isEditing && editPreviewUrl ? editPreviewUrl : isEditing && removeEditImage ? "" : t.image_url ?? "";

              return (
                <div className="item" key={t.id}>
                  <div className="item-row">
                    <div
                      className={`thumb-sm ${thumbUrl ? "clickable" : ""}`}
                      onClick={() => thumbUrl && openViewer(thumbUrl, t.text)}
                      title={thumbUrl ? "Click to open" : ""}
                    >
                      {thumbUrl ? <img src={thumbUrl} alt="" loading="lazy" /> : <span className="subtle">—</span>}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div className="item-title">{t.text}</div>
                      <div className="subtle" style={{ marginTop: 2 }}>
                        {new Date(t.created_at).toLocaleString()}
                        {viewMode === "all" ? (
                          <>
                            {" • "}
                            <b>User:</b> {t.user_id.slice(0, 8)}…
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="item-actions">
                      <button className="btn btn-ghost" onClick={() => (isEditing ? cancelEdit() : startEdit(t))} disabled={savingEdit || deletingId === t.id}>
                        {isEditing ? "Cancel" : "Edit"}
                      </button>

                      <button className="btn btn-danger" onClick={() => onDeleteTask(t)} disabled={deletingId === t.id || savingEdit}>
                        {deletingId === t.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="panel">
                      <div className="grid">
                        <label className="label">
                          <span>Edit text</span>
                          <input className="input" value={editText} onChange={(e) => setEditText(e.target.value)} />
                        </label>

                        <div className="row2">
                          <div
                            className={`thumb ${(editPreviewUrl || (!removeEditImage && t.image_url)) ? "clickable" : ""}`}
                            onClick={() => {
                              const url = editPreviewUrl || (!removeEditImage ? (t.image_url ?? "") : "");
                              if (url) openViewer(url, `Preview: ${t.text}`);
                            }}
                            title="Click to open"
                          >
                            {editPreviewUrl ? (
                              <img src={editPreviewUrl} alt="New preview" />
                            ) : !removeEditImage && t.image_url ? (
                              <img src={t.image_url} alt="Current" />
                            ) : (
                              <span className="subtle">No image</span>
                            )}
                          </div>

                          <div className="grid" style={{ gap: 10 }}>
                            <label className="label">
                              <span>Replace image (optional)</span>
                              <input
                                className="input"
                                style={{ padding: 10 }}
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] ?? null;
                                  setEditFile(f);
                                  if (f) setRemoveEditImage(false);
                                }}
                              />
                            </label>

                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => {
                                  setEditFile(null);
                                  setEditPreviewUrl("");
                                  setRemoveEditImage(true);
                                }}
                                disabled={savingEdit || (!t.image_url && !editPreviewUrl)}
                              >
                                Remove image
                              </button>

                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => {
                                  setEditFile(null);
                                  setEditPreviewUrl("");
                                  setRemoveEditImage(false);
                                }}
                                disabled={savingEdit}
                              >
                                Keep current
                              </button>
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                              <button className="btn btn-primary" type="button" onClick={() => saveEdit(t)} disabled={savingEdit}>
                                {savingEdit ? "Saving…" : "Save changes"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}