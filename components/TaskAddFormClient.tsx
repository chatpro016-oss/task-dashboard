"use client";

import { useEffect, useState } from "react";
import { addTaskAction } from "../app/dashboard/actions";

export default function TaskAddFormClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <form action={addTaskAction} className="grid">
      <label className="label">
        <span>Task</span>
        <input className="input" name="text" placeholder="Write your task…" />
      </label>

      <div className="row2">
        <div className="thumb">
          {preview ? <img src={preview} alt="Preview" /> : <span className="subtle">No image</span>}
        </div>

        <div className="grid" style={{ gap: 8 }}>
          <div className="subtle">Optional image upload</div>
          <input
            className="input"
            style={{ padding: 10 }}
            type="file"
            name="image"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <button className="btn btn-primary" type="submit">
        Add task
      </button>
    </form>
  );
}