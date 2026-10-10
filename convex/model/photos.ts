import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_GALLERY = 6;

/** What is wrong with an uploaded file, if anything. `null` meta means the upload does not exist. */
export function imageProblem(meta: { size: number; contentType?: string } | null): string | null {
  if (!meta) return "That upload could not be found. Try again.";
  if (!meta.contentType || !PHOTO_TYPES.includes(meta.contentType)) return "Use a JPEG, PNG or WebP image.";
  if (meta.size > MAX_PHOTO_BYTES) return "That image is over 5 MB. Choose a smaller one.";
  return null;
}

/**
 * Checks a just-uploaded file. A bad file is deleted and reported as a result, not thrown, because a thrown error
 * would roll the deletion back and leave the file in storage.
 */
export async function checkImage(ctx: MutationCtx, storageId: Id<"_storage">): Promise<{ ok: true } | { ok: false; reason: string }> {
  const meta = await ctx.db.system.get(storageId);
  const problem = imageProblem(meta ? { size: meta.size, contentType: meta.contentType } : null);
  if (!problem) return { ok: true };
  if (meta) await ctx.storage.delete(storageId);
  return { ok: false, reason: problem };
}

/** A provider document for public use: the uploaded photo (as a URL) wins over the seeded path, and storage ids stay internal. */
export async function withPhotoUrl(ctx: QueryCtx, p: Doc<"providers">) {
  const { photoStorageId, ...rest } = p;
  const url = photoStorageId ? await ctx.storage.getUrl(photoStorageId) : null;
  return { ...rest, photo: url ?? rest.photo };
}
