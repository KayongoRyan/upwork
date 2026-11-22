const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/tiff": [".tif", ".tiff"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
  "application/acad": [".dwg"],
  "application/x-acad": [".dwg"],
  "application/dwg": [".dwg"],
  "image/vnd.dwg": [".dwg"],
  "application/dxf": [".dxf"],
  "image/vnd.dxf": [".dxf"],
};

const ALLOWED_EXTENSIONS = new Set(Object.values(ALLOWED_FILE_TYPES).flat());

export interface ValidatedFile {
  fileName: string;
  contentType: string;
  size: number;
  bytes: Buffer;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function validateUploadFile(file: unknown, maxBytes = MAX_FILE_BYTES): { ok: true; value: ValidatedFile } | { ok: false; error: string } {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  if (file.size > maxBytes) return { ok: false, error: `Keep the file under ${Math.floor(maxBytes / (1024 * 1024))} MB.` };

  const fileName = file.name || "upload";
  const ext = extensionOf(fileName);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: "File type not allowed. Use PDF, image, Office, text, CSV, ZIP, DWG, or DXF files." };
  }

  const type = (file.type || "").trim().toLowerCase();
  const normalizedFromExt = Object.entries(ALLOWED_FILE_TYPES).find(([, exts]) => exts.includes(ext))?.[0] || "application/octet-stream";
  if (type && type !== "application/octet-stream") {
    const allowedExts = ALLOWED_FILE_TYPES[type];
    if (!allowedExts) {
      return { ok: false, error: "MIME type not allowed." };
    }
    if (!allowedExts.includes(ext)) {
      return { ok: false, error: "File extension does not match the MIME type." };
    }
  }

  // Normalize content type from allowlist when browser omits it or sends generic octet-stream.
  const normalizedType = type && type !== "application/octet-stream" ? type : normalizedFromExt;
  return { ok: true, value: { fileName, contentType: normalizedType, size: file.size, bytes: Buffer.alloc(0) } };
}

export async function readValidatedUploadFile(file: File, maxBytes = MAX_FILE_BYTES): Promise<{ ok: true; value: ValidatedFile } | { ok: false; error: string }> {
  const validated = validateUploadFile(file, maxBytes);
  if (!validated.ok) return validated;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > maxBytes) return { ok: false, error: `Keep the file under ${Math.floor(maxBytes / (1024 * 1024))} MB.` };
  return { ok: true, value: { ...validated.value, bytes } };
}