import { useState } from "react";
import { popupTools } from "../domain/preferences";
import type { Result } from "./model";

export function PopupItems({
  actions,
  items,
  save,
}: {
  actions: Result[];
  items: string[];
  save: (items: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const choices = new Map<string, string>([
    ...actions
      .filter((action) => action.id !== "open-palette")
      .map(({ id, label }): [string, string] => [id, label]),
    ...Object.entries(popupTools),
  ]);
  const available = [...choices]
    .filter(([id]) => !items.includes(id))
    .sort((a, b) => a[1].localeCompare(b[1]));
  const selection = available.some(([id]) => id === selected) ? selected : "";
  async function update(next: string[]) {
    setPending(true);
    try {
      await save(next);
    } finally {
      setPending(false);
    }
  }
  function move(index: number, offset: number) {
    const id = items[index];
    if (!id) return;
    const next = items.filter((_, position) => position !== index);
    next.splice(index + offset, 0, id);
    void update(next);
  }
  return (
    <section id="popup-items" tabIndex={-1} aria-label="Customize popup">
      <form
        className="settings-actions popup-item-picker"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && selection) void update([...items, selection]);
        }}
      >
        <label className="field">
          Add an item
          <select
            value={selection}
            onChange={(event) => {
              setSelected(event.target.value);
            }}
            disabled={pending || !available.length}
          >
            <option value="">Choose an item</option>
            {available.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={pending || !selection}>Add</button>
      </form>
      {!items.length && <p className="muted">No popup items selected.</p>}
      <ol className="popup-item-list" aria-label="Popup item order">
        {items.map((id, index) => {
          const label = choices.get(id) ?? id;
          return (
            <li className="custom-row" key={id}>
              <span>{label}</span>
              <button
                disabled={pending || index === 0}
                aria-label={`Move ${label} up`}
                onClick={() => {
                  move(index, -1);
                }}
              >
                ↑
              </button>
              <button
                disabled={pending || index === items.length - 1}
                aria-label={`Move ${label} down`}
                onClick={() => {
                  move(index, 1);
                }}
              >
                ↓
              </button>
              <button
                disabled={pending}
                aria-label={`Remove ${label}`}
                onClick={() => void update(items.filter((item) => item !== id))}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
