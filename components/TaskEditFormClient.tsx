"use client";

import { useEffect, useState } from "react";
import { updateTaskAction } from "../app/dashboard/actions";

export default function TaskEditFormClient(props: {
  taskId: string;
  initialText: string;
  currentImageUrl: string | null;
  returnTo: string;
}) {
  const [text, setText] = useState(props.initialText);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview || (!removeImage ? props.currentImageUrl : "");

  return (
    <form action={updateTaskAction} className="grid">
      <input type="hidden" name="taskId" value={props.taskId} />
      <input type="hidden" name="returnTo" value={props.returnTo} />
      <input type="hidden" name="removeImage" value={removeImage ? "1" : "0"} />

      <label className="label">
        <span>Text</span>
        <input className="input" name="text" value={text} onChange={(e) => setText(e.target.value)} />
      </label>

      <div className="row2">
        <div className="thumb">
          {shown ? <img src={shown} alt="Preview" /> : <span className="subtle">No image</span>}
        </div>

        <div className="grid" style={{ gap: 10 }}>
          <label className="label">
            <span>Replace image (optional)</span>
            <input
              className="input"
              style={{ padding: 10 }}
              type="file"
              name="image"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) setRemoveImage(false);
              }}
            />
          </label>

          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setFile(null);
              setPreview("");
              setRemoveImage(true);
            }}
            disabled={!props.currentImageUrl && !preview}
          >
            Remove image
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn btn-primary" type="submit">
          Save
        </button>
      </div>
    </form>
  );
}