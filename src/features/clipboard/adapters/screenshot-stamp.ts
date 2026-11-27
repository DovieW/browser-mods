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

function drawLabel(
  context: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  url: string,
  offset = 0,
) {
  if (!url) return;
  const fontSize = Math.max(12, Math.min(32, Math.round(width / 65)));
  const padding = Math.ceil(fontSize / 2);
  const margin = padding;
  const labelHeight = fontSize + padding * 2;
  const available = width - margin * 2 - padding * 2;
  if (height < labelHeight + margin || available <= 0) return;

  context.font = `bold ${fontSize}px monospace`;
  const label = fitLabel(context, url, available);
  if (!label) return;
  const labelWidth = Math.ceil(context.measureText(label).width) + padding * 2;
  const left = offset + width - margin - labelWidth;
  const top = height - margin - labelHeight;
  context.fillStyle = "#000";
  context.fillRect(left, top, labelWidth, labelHeight);
  context.fillStyle = "#ffeb00";
  context.textBaseline = "middle";
  context.fillText(label, left + padding, top + labelHeight / 2);
}

export async function stampScreenshot(blob: Blob, url: string): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw Error("Screenshot canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    drawLabel(context, bitmap.width, bitmap.height, url);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
}

export async function stitchScreenshots(
  left: Blob,
  right: Blob,
  leftUrl: string,
  rightUrl: string,
): Promise<Blob> {
  const first = await createImageBitmap(left);
  let second: ImageBitmap | undefined;
  try {
    second = await createImageBitmap(right);
    const divider = 4;
    const rightOffset = first.width + divider;
    const width = rightOffset + second.width;
    const height = Math.max(first.height, second.height);
    if (width > 16_384 || height > 16_384 || width * height > 40_000_000)
      throw Error("Split screenshot is too large");

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw Error("Screenshot canvas unavailable");
    context.fillStyle = "#30363d";
    context.fillRect(0, 0, width, height);
    context.drawImage(first, 0, 0);
    context.drawImage(second, rightOffset, 0);
    drawLabel(context, first.width, first.height, leftUrl);
    drawLabel(context, second.width, second.height, rightUrl, rightOffset);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    first.close();
    second?.close();
  }
}
