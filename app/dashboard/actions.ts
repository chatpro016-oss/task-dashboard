"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../../lib/supabase/server";

const BUCKET = "task-images";

function safeId() {
  return crypto.randomUUID();
}

function getObjectPathFromPublicUrl(imageUrl: string): string | null {
  try {
    const u = new URL(imageUrl);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

async function requireSupabase() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("Missing Supabase env vars");
  return supabase;
}

export async function signOutAction() {
  const supabase = await requireSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function addTaskAction(formData: FormData) {
  const supabase = await requireSupabase();

  const { data: uData } = await supabase.auth.getUser();
  const user = uData.user;
  if (!user) redirect("/login");

  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("Task text required");

  const file = formData.get("image") as File | null;

  let imageUrl: string | null = null;

  if (file && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Invalid image");
    if (file.size > 5 * 1024 * 1024) throw new Error("Max 5MB");

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const objectName = `${user.id}/${safeId()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectName, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
    imageUrl = pub.publicUrl;
  }

  const { error: insErr } = await supabase.from("tasks").insert({
    user_id: user.id,
    text,
    image_url: imageUrl,
  });

  if (insErr) throw new Error(insErr.message);

  revalidatePath("/dashboard");
}

export async function deleteTaskAction(formData: FormData) {
  const supabase = await requireSupabase();

  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) throw new Error("Missing taskId");

  const { data: row, error: selErr } = await supabase
    .from("tasks")
    .select("id,user_id,image_url")
    .eq("id", taskId)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (!row) return;

  if (row.image_url) {
    const path = getObjectPathFromPublicUrl(row.image_url);
    if (path && path.startsWith(`${row.user_id}/`)) {
      await supabase.storage.from(BUCKET).remove([path]);
    }
  }

  const { error: delErr } = await supabase.from("tasks").delete().eq("id", taskId);
  if (delErr) throw new Error(delErr.message);

  revalidatePath("/dashboard");
}

export async function updateTaskAction(formData: FormData) {
  const supabase = await requireSupabase();

  const taskId = String(formData.get("taskId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/dashboard");

  const removeImage = String(formData.get("removeImage") ?? "") === "1";
  const file = formData.get("image") as File | null;

  if (!taskId) throw new Error("Missing taskId");
  if (!text) throw new Error("Task text required");

  const { data: row, error: selErr } = await supabase
    .from("tasks")
    .select("id,user_id,image_url")
    .eq("id", taskId)
    .single();

  if (selErr) throw new Error(selErr.message);

  const targetUserId = row.user_id;

  let newImageUrl: string | null | undefined = undefined;

  if (file && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Invalid image");
    if (file.size > 5 * 1024 * 1024) throw new Error("Max 5MB");

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const objectName = `${targetUserId}/${safeId()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectName, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
    newImageUrl = pub.publicUrl;
  } else if (removeImage) {
    newImageUrl = null;
  }

  const payload: any = { text };
  if (newImageUrl !== undefined) payload.image_url = newImageUrl;

  const { error: upErr2 } = await supabase.from("tasks").update(payload).eq("id", taskId);
  if (upErr2) throw new Error(upErr2.message);

  if (row.image_url && newImageUrl !== undefined) {
    const oldPath = getObjectPathFromPublicUrl(row.image_url);
    if (oldPath && oldPath.startsWith(`${targetUserId}/`)) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }
  }

  revalidatePath("/dashboard");
  redirect(returnTo);
}