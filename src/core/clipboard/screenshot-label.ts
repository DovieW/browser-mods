export const screenshotCorners = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
] as const;

type Corner = (typeof screenshotCorners)[number];

export type ScreenshotLabelStyle = {
  screenshotLabelCorner: Corner;
  screenshotLabelTextColor: string;
  screenshotLabelBackgroundColor: string;
  screenshotLabelFontSize: number;
  screenshotLabelPadding: number;
  screenshotLabelMaxLength: number;
};

export const screenshotLabelDefaults: ScreenshotLabelStyle = {
  screenshotLabelCorner: "bottom-right",
  screenshotLabelTextColor: "#ffeb00",
  screenshotLabelBackgroundColor: "#000000",
  screenshotLabelFontSize: 0,
  screenshotLabelPadding: 0,
  screenshotLabelMaxLength: 240,
};

export const screenshotLabelLimits = {
  screenshotLabelFontSize: { min: 0, max: 64 },
  screenshotLabelPadding: { min: 0, max: 64 },
  screenshotLabelMaxLength: { min: 12, max: 512 },
} as const;

export function parseScreenshotLabel(value: unknown): ScreenshotLabelStyle {
  const style = { ...screenshotLabelDefaults };
  if (!value || typeof value !== "object") return style;
  for (const corner of screenshotCorners) {
    if (Reflect.get(value, "screenshotLabelCorner") === corner)
      style.screenshotLabelCorner = corner;
  }
  for (const key of [
    "screenshotLabelTextColor",
    "screenshotLabelBackgroundColor",
  ] as const) {
    const color: unknown = Reflect.get(value, key);
    if (typeof color === "string" && /^#[\da-f]{6}$/i.test(color))
      style[key] = color;
  }
  for (const key of [
    "screenshotLabelFontSize",
    "screenshotLabelPadding",
    "screenshotLabelMaxLength",
  ] as const) {
    const number: unknown = Reflect.get(value, key);
    const { min, max } = screenshotLabelLimits[key];
    if (
      typeof number === "number" &&
      Number.isInteger(number) &&
      number >= min &&
      number <= max
    )
      style[key] = number;
  }
  return style;
}
