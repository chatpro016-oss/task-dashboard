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

type ProfileRow = { user_id: string; email: string | null };

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

export default function AdminPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!url || !anon) throw new Error("Missing Supabase env vars");
    return createClient(url, anon);
  }, []);

  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  // image viewer (optional)
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");
  const openViewer = (url: string, title?: string) => {
    if (!url) return;
    setViewerUrl(url);
    setViewerTitle(title || "Preview");
  };
  const closeViewer = () => {
    setViewerUrl("");
    setViewerTitle("");
  };

  // edit state
  const [editingId, setEditingId] = useState("");
  const [editText, setEditText] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState("");
  const [removeEditImage, setRemoveEditImage] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState("");

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
    if (!f.type.startsWith("image/")) throw new Error("Please choose an image file.");
    if (f.size > MAX_IMAGE_BYTES) throw new Error("Image too large (max 5MB).");
  }

  async function uploadImage(targetUserId: string, f: File) {
    validateImage(f);
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const objectName = `${targetUserId}/${safeId()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(objectName, f, {
      upsert: false,
      contentType: f.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
    return data.publicUrl as string;
  }

  async function tryDeleteStorageByUrl(targetUserId: string, imageUrl: string) {
    const objectPath = getObjectPathFromPublicUrl(imageUrl);
    if (!objectPath || !objectPath.startsWith(`${targetUserId}/`)) return;

    const { error } = await supabase.storage.from(BUCKET).remove([objectPath]);
    if (error) console.warn("Storage remove error:", error.message);
  }

  async function loadAll() {
    setTasksLoading(true);
    setError("");

    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select("id,user_id,text,image_url,created_at")
      .order("created_at", { ascending: false });

    if (tErr) {
      setError(tErr.message);
      setTasksLoading(false);
      return;
    }

    const tasks = tData ?? [];
    setTasks(tasks);

    const userIds = Array.from(new Set(tasks.map((t) => t.user_id)));
    if (userIds.length) {
      const { data: pData, error: pErr } = await supabase
        .from("profiles")
        .select("user_id,email")
        .in("user_id", userIds);

      if (!pErr) {
        const map: Record<string, string> = {};
        (pData as ProfileRow[] | null)?.forEach((p) => {
          if (p.user_id) map[p.user_id] = p.email ?? "";
        });
        setProfiles(map);
      }
    }

    setTasksLoading(false);
  }

  // Admin gate + initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");

      const { data: uData } = await supabase.auth.getUser();
      const user = uData.user;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: adminRow, error: adminErr } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminErr) {
        setError(adminErr.message);
        setLoading(false);
        return;
      }

      if (!adminRow) {
        router.replace("/dashboard");
        return;
      }

      await loadAll();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(t: TaskRow) {
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
  }

  async function saveEdit(t: TaskRow) {
    setSavingEdit(true);
    setError("");

    try {
      const trimmed = editText.trim();
      if (!trimmed) throw new Error("Text required.");

      let newImageUrl: string | null | undefined = undefined;
      if (editFile) newImageUrl = await uploadImage(t.user_id, editFile); // upload into OWNER folder
      else if (removeEditImage) newImageUrl = null;

      const payload: any = { text: trimmed };
      if (newImageUrl !== undefined) payload.image_url = newImageUrl;

      const { error: upErr } = await supabase.from("tasks").update(payload).eq("id", t.id);
      if (upErr) throw new Error(upErr.message);

      // cleanup old image if replaced/removed
      if (t.image_url && newImageUrl !== undefined) {
        await tryDeleteStorageByUrl(t.user_id, t.image_url);
      }

      await loadAll();
      cancelEdit();
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      if (mountedRef.current) setSavingEdit(false);
    }
  }

  async function deleteTask(t: TaskRow) {
    const ok = window.confirm("Delete this task? (image also deleted)");
    if (!ok) return;

    setDeletingId(t.id);
    setError("");

    try {
      if (t.image_url) await tryDeleteStorageByUrl(t.user_id, t.image_url);

      const { error: delErr } = await supabase.from("tasks").delete().eq("id", t.id);
      if (delErr) throw new Error(delErr.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      if (mountedRef.current) setDeletingId("");
    }
  }

  if (loading) {
    return (
      <main className="container">
        <div className="card card-pad" style={{ height: 180 }} />
      </main>
    );
  }

  return (
    <main className="container">
      {/* Viewer */}
      {viewerUrl ? (
        <div className="viewerOverlay" onClick={(e) => e.target === e.currentTarget && closeViewer()}>
          <div className="viewerModal">
            <div className="viewerTop">
              <div className="viewerTitle" title={viewerTitle}>{viewerTitle}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <a className="btn btn-ghost" href={viewerUrl} target="_blank" rel="noreferrer">Open in new tab</a>
                <button className="btn" onClick={closeViewer}>Close</button>
              </div>
            </div>
            <div className="viewerBody">
              <img className="viewerImg" src={viewerUrl} alt={viewerTitle || "Preview"} />
            </div>
          </div>
        </div>
      ) : null}

      <header className="card topbar">
        <div className="title">
          <div className="kicker">Admin Panel</div>
          <div className="h1">All users tasks</div>
          <div className="subtle">Emails are loaded from <b>public.profiles</b>.</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={loadAll} disabled={tasksLoading}>
            {tasksLoading ? "Refreshing…" : "Refresh"}
          </button>
          <button className="btn" onClick={() => router.push("/dashboard")}>Back</button>
        </div>
      </header>

      <div style={{ height: 14 }} />

      <section className="card card-pad">
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="subtle" style={{ marginTop: 6 }}>
          Total tasks: <b>{tasks.length}</b>
        </div>

        <div className="list">
          {tasks.map((t) => {
            const email = profiles[t.user_id] || "(no email)";
            const isEditing = editingId === t.id;
            const thumbUrl = isEditing && editPreviewUrl ? editPreviewUrl : t.image_url ?? "";

            return (
              <div className="item" key={t.id}>
                <div className="item-row">
                  <div
                    className={`thumb-sm ${thumbUrl ? "clickable" : ""}`}
                    onClick={() => thumbUrl && openViewer(thumbUrl, `${t.text} • ${email}`)}
                    title={thumbUrl ? "Click to open" : ""}
                  >
                    {thumbUrl ? <img src={thumbUrl} alt="" loading="lazy" /> : <span className="subtle">—</span>}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div className="item-title">{t.text}</div>
                    <div className="subtle" style={{ marginTop: 2 }}>
                      <b>{email}</b> • {t.user_id.slice(0, 8)}… • {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="item-actions">
                    <button className="btn btn-ghost" onClick={() => (isEditing ? cancelEdit() : startEdit(t))} disabled={savingEdit}>
                      {isEditing ? "Cancel" : "Edit"}
                    </button>
                    <button className="btn btn-danger" onClick={() => deleteTask(t)} disabled={deletingId === t.id || savingEdit}>
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
                          className={`thumb ${t.image_url || editPreviewUrl ? "clickable" : ""}`}
                          onClick={() => {
                            const url = editPreviewUrl || t.image_url || "";
                            if (url) openViewer(url, `Preview: ${t.text} • ${email}`);
                          }}
                          title="Click to open"
                        >
                          {editPreviewUrl ? (
                            <img src={editPreviewUrl} alt="New preview" />
                          ) : t.image_url ? (
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
          })}
        </div>
      </section>
    </main>
  );
}