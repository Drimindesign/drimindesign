"use client";

import type { PadAction } from "./arena-controls";
import styles from "./arena.module.css";

/* Touch pads: move under the left thumb, jump / swing / block / Master Stroke under the right. */
const LEFT: readonly { action: PadAction; label: string; glyph: string }[] = [
  { action: "left", label: "Move left (hold to run)", glyph: "◀" },
  { action: "right", label: "Move right (hold to run)", glyph: "▶" },
];
const RIGHT: readonly { action: PadAction; label: string; glyph: string }[] = [
  { action: "block", label: "Block (hold); just as a blow lands, parry", glyph: "⛨" },
  { action: "jump", label: "Jump", glyph: "▲" },
  { action: "attack", label: "Swing the sword (tap again to chain the combo)", glyph: "⚔" },
  { action: "master", label: "Master Stroke (when the meter is full)", glyph: "★" },
];

export function ArenaPads({ onPad }: { onPad: (action: PadAction, down: boolean) => void }): React.ReactElement {
  const pad = (p: { action: PadAction; label: string; glyph: string }): React.ReactElement => (
    <button
      key={p.action}
      type="button"
      className={styles.pad}
      data-action={p.action}
      aria-label={p.label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPad(p.action, true);
      }}
      onPointerUp={() => onPad(p.action, false)}
      onPointerCancel={() => onPad(p.action, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {p.glyph}
    </button>
  );
  return (
    <div className={styles.pads}>
      <div className={styles.padGroup}>{LEFT.map(pad)}</div>
      <div className={styles.padGroup}>{RIGHT.map(pad)}</div>
    </div>
  );
}
