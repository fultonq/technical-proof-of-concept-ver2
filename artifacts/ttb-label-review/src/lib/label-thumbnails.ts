const PREFIX = "ttb-thumb-";

export function saveThumbnail(labelId: string, dataUrl: string): void {
  try {
    sessionStorage.setItem(PREFIX + labelId, dataUrl);
  } catch {
    // Quota exceeded — thumbnails are non-critical, silently skip.
  }
}

export function getThumbnail(labelId: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + labelId);
  } catch {
    return null;
  }
}

export function svgToThumbnailDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Reads a File and returns a small JPEG data URL suitable for thumbnail display.
 * Resizes the image so the longest edge is at most `maxPx` before encoding,
 * keeping storage small enough to stay well within sessionStorage quota.
 */
export function fileToThumbnailDataUrl(file: File, maxPx = 120): Promise<string> {
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
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
