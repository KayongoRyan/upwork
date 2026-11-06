import { nextId } from "@/lib/utils";
import type { ReportPhoto } from "@/types";

const MAX_PHOTOS = 4;
const MAX_EDGE = 1280;

export async function filesToPhotos(files: FileList | null, existing: ReportPhoto[]) {
  const incoming = [...(files ?? [])].filter((file) => file.type.startsWith("image/"));
  const room = MAX_PHOTOS - existing.length;
  const accepted = incoming.slice(0, Math.max(0, room));
  const photos = await Promise.all(accepted.map(readPhoto));
  return {
    photos: [...existing, ...photos],
    skipped: incoming.length - accepted.length,
  };
}

async function readPhoto(file: File): Promise<ReportPhoto> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  context?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return {
    id: nextId("photo"),
    name: file.name,
    type: "image/jpeg",
    size: file.size,
    dataUrl: canvas.toDataURL("image/jpeg", 0.72),
  };
}
