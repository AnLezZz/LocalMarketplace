"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../lib/convex";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 5 * 1024 * 1024;

/** Picks an image, uploads it straight to Convex storage, then attaches it to the profile or gallery. */
/** `profile` and `gallery` are a provider's photos; `account` is the signed-in user's own picture. */
export default function PhotoUpload({ kind, label }: { kind: "profile" | "gallery" | "account"; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const makeUrl = useMutation(kind === "account" ? api.account.generateUploadUrl : api.providers.generateUploadUrl);
  const attach = useMutation(kind === "account" ? api.account.setPhoto : kind === "profile" ? api.providers.setPhoto : api.providers.addGalleryPhoto);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Use a JPEG, PNG or WebP image.");
    if (file.size > MAX) return setError("That image is over 5 MB. Choose a smaller one.");
    setBusy(true);
    try {
      const url = await makeUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = (await res.json()) as { storageId: string };
      const r = (await attach({ storageId } as never)) as { ok: boolean; reason?: string };
      if (!r.ok) setError(r.reason ?? "That image could not be used.");
      else router.refresh();
    } catch {
      setError("The upload didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upl">
      <input ref={input} type="file" accept={TYPES.join(",")} className="sr-only" id={`file-${kind}`} onChange={onPick} disabled={busy} />
      <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : label}</button>
      {error && <p className="upl__err" role="alert">{error}</p>}
    </div>
  );
}
