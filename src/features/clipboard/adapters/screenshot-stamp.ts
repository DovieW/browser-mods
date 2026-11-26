function fitLabel(
  context: OffscreenCanvasRenderingContext2D,
  text: string,
  available: number,
): string {
  if (context.measureText(text).width <= available) return text;
  if (context.measureText("…").width > available) return "";

  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (context.measureText(text.slice(0, middle) + "…").width <= available)
      low = middle;
    else high = middle - 1;
  }
  return text.slice(0, low) + "…";
}

export async function stampScreenshot(blob: Blob, url: string): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    // Keep the label proportional on HiDPI displays and legible on small ones.
    const fontSize = Math.max(12, Math.min(32, Math.round(bitmap.width / 65)));
    const padding = Math.ceil(fontSize / 2);
    const margin = padding;
    const height = fontSize + padding * 2;
    const available = bitmap.width - margin * 2 - padding * 2;
    if (bitmap.height < height + margin || available <= 0) return blob;

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw Error("Screenshot canvas unavailable");
    context.font = `bold ${fontSize}px monospace`;
    const label = fitLabel(context, url, available);
    if (!label) return blob;
    const width = Math.ceil(context.measureText(label).width) + padding * 2;
    const left = bitmap.width - margin - width;
    const top = bitmap.height - margin - height;
    context.drawImage(bitmap, 0, 0);
    context.fillStyle = "#000";
    context.fillRect(left, top, width, height);
    context.fillStyle = "#ffeb00";
    context.textBaseline = "middle";
    context.fillText(label, left + padding, top + height / 2);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
}
