"use client";
import { useRef, useState } from "react";
import type { SquadOrder } from "./route-map-state";
import styles from "./route-map.module.css";

interface RouteMapProps { toggle(): void; close(): void; order(order: SquadOrder): void }
export function RouteMap({ toggle, close, order }: RouteMapProps): React.ReactElement {
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const destination = useRef<HTMLInputElement>(null);
  const choose = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const node = event.currentTarget;
    setSelected({ id: Number(node.dataset.unitId), name: node.dataset.name ?? "Soldier" });
    toggleOpen();
  };
  // Marker inspection opens the tactical panel; the simulation remains authoritative.
  const toggleOpen = (): void => { if (document.querySelector('[data-route-map]')?.closest('[data-map="on"]')) return; toggle(); };
  const issue = (kind: SquadOrder["kind"]): void => {
    const x = Number(destination.current?.value ?? 0);
    if (selected && Number.isFinite(x)) order({ unit: selected.id, kind, x });
  };
  return <aside className={styles.map} data-route-map aria-label="Route and squad map" data-lenis-prevent="">
    <div className={styles.bar}><button type="button" onClick={toggle}>Route map · T</button><span data-map-scale /></div>
    <div className={styles.tracks}>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0,76 H1000" className={styles.ground} /><path data-map-upper className={styles.upper} /><path data-map-crossings className={styles.crossings} /></svg>
      <span className={styles.queen} data-map-queen title="Queen">Q</span>
      {Array.from({length:16},(_,i)=><button key={i} type="button" hidden data-map-unit className={styles.unit} onClick={choose} />)}
      {Array.from({length:8},(_,i)=><span key={i} hidden data-map-objective className={styles.objective}>◆</span>)}
    </div>
    <div className={styles.expanded}>
      <p>Upper path above · ground below · vertical lines are rope crossings. Select a soldier. Orders change their destination; travel stays physical.</p>
      <p aria-live="polite">{selected ? `Selected: ${selected.name}` : "Select a soldier marker to issue orders."}</p>
      <label>Soldier <select defaultValue="" onChange={(event) => { const option = event.currentTarget.selectedOptions[0]; if (option?.value) setSelected({ id: Number(option.value), name: option.dataset.name ?? "Soldier" }); }}><option value="">Choose a soldier</option>{Array.from({length:16},(_,i)=><option key={i} value={`slot-${i}`} data-map-option hidden />)}</select></label>
      <label>Destination in metres <input ref={destination} data-map-destination type="number" min="0" defaultValue="0" step="5" /></label>
      <div className={styles.orders}>
        <button type="button" disabled={!selected} onClick={()=>issue("hold")}>Hold position</button>
        <button type="button" disabled={!selected} onClick={()=>issue("regroup")}>Return to queen</button>
        <button type="button" disabled={!selected} onClick={()=>issue("scout")}>Advance to destination</button>
        <button type="button" disabled={!selected} onClick={()=>issue("follow")}>Resume assignment</button>
        <button type="button" onClick={close}>Close map · resume</button>
      </div>
      <p>Q queen · ◆ objective · amber fighting · red wounded · dashed outline waiting at a crossing. Time is paused while this panel is open.</p>
    </div>
  </aside>;
}
