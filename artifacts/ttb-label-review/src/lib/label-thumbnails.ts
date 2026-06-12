const THUMB_PREFIX = "ttb-thumb-";
const FULL_PREFIX  = "ttb-full-";

// ── Grid thumbnail (small, ~120px longest edge) ───────────────────────────────

export function saveThumbnail(labelId: string, dataUrl: string): void {
  try { sessionStorage.setItem(THUMB_PREFIX + labelId, dataUrl); } catch { /* quota */ }
}

export function getThumbnail(labelId: string): string | null {
  try { return sessionStorage.getItem(THUMB_PREFIX + labelId); } catch { return null; }
}

// ── Lightbox image (medium, ~600px longest edge) ──────────────────────────────

export function saveFullImage(labelId: string, dataUrl: string): void {
  try { sessionStorage.setItem(FULL_PREFIX + labelId, dataUrl); } catch { /* quota */ }
}

export function getFullImage(labelId: string): string | null {
  try { return sessionStorage.getItem(FULL_PREFIX + labelId); } catch { return null; }
}

// ── SVG helper (vector — sharp at any size) ───────────────────────────────────

export function svgToThumbnailDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ── Raster resize helper ──────────────────────────────────────────────────────

/**
 * Reads a File and returns a JPEG data URL scaled so the longest edge is at
 * most `maxPx`. Used to generate both the small grid thumbnail and the larger
 * lightbox image from the same source file.
 */
export function fileToResizedDataUrl(file: File, maxPx: number, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(maxPx / Math.max(img.width, img.height), 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("No canvas context")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
