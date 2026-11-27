import {
  parseScreenshotLabel,
  screenshotCorners,
  screenshotLabelLimits,
  type ScreenshotLabelStyle,
} from "../../../core/clipboard/screenshot-label";

type Props = {
  style: ScreenshotLabelStyle;
  save: <K extends keyof ScreenshotLabelStyle>(
    key: K,
    value: ScreenshotLabelStyle[K],
  ) => Promise<void>;
};

const colors = [
  ["screenshotLabelTextColor", "Text color"],
  ["screenshotLabelBackgroundColor", "Background color"],
] as const;
const numbers = [
  ["screenshotLabelFontSize", "Font size (px, 0 for auto)"],
  ["screenshotLabelPadding", "Padding (px, 0 for auto)"],
  ["screenshotLabelMaxLength", "Maximum URL length"],
] as const;

export function ScreenshotLabelSettings({ style, save }: Props) {
  const corner = style.screenshotLabelCorner;
  const padding = style.screenshotLabelPadding || 7;
  const fontSize = style.screenshotLabelFontSize || 14;
  const sample = "https://example.com/products/compare?view=details";
  const limit = style.screenshotLabelMaxLength;
  const text =
    sample.length > limit ? sample.slice(0, limit - 1) + "…" : sample;

  return (
    <fieldset className="screenshot-label-settings">
      <legend>Screenshot URL label</legend>
      <div className="screenshot-label-controls">
        <div className="screenshot-label-control">
          <label htmlFor="screenshotLabelCorner">Position</label>
          <select
            id="screenshotLabelCorner"
            value={corner}
            onChange={(event) => {
              const candidate = parseScreenshotLabel({
                screenshotLabelCorner: event.target.value,
              });
              void save(
                "screenshotLabelCorner",
                candidate.screenshotLabelCorner,
              );
            }}
          >
            {screenshotCorners.map((position) => (
              <option key={position} value={position}>
                {position.charAt(0).toUpperCase() +
                  position.slice(1).replace("-", " ")}
              </option>
            ))}
          </select>
        </div>
        {colors.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              id={key}
              type="color"
              value={style[key]}
              onChange={(event) => {
                void save(key, event.target.value);
              }}
            />
          </label>
        ))}
        {numbers.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              id={key}
              type="number"
              key={style[key]}
              defaultValue={style[key]}
              {...screenshotLabelLimits[key]}
              onBlur={(event) => {
                const field = event.currentTarget;
                if (
                  !Number.isInteger(field.valueAsNumber) ||
                  !field.validity.valid
                ) {
                  field.value = String(style[key]);
                  return;
                }
                if (field.valueAsNumber !== style[key])
                  void save(key, field.valueAsNumber);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </label>
        ))}
      </div>
      <div
        aria-label="URL label preview"
        className="screenshot-label-preview"
        style={{
          justifyContent: corner.endsWith("right") ? "flex-end" : "flex-start",
          alignItems: corner.startsWith("top") ? "flex-start" : "flex-end",
        }}
      >
        <span
          style={{
            color: style.screenshotLabelTextColor,
            backgroundColor: style.screenshotLabelBackgroundColor,
            fontSize,
            padding,
          }}
        >
          {text}
        </span>
      </div>
    </fieldset>
  );
}
