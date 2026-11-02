import styles from "./route-map.module.css";

/** Read-only level progress; squad movement stays automatic. */
export function RouteMap(): React.ReactElement {
  return <aside className={styles.map} data-route-map aria-label="Level progress and squad positions">
    <div className={styles.track} aria-hidden="true"><span className={styles.progress} data-map-progress /></div>
    {Array.from({ length: 16 }, (_, i) => <span key={i} hidden data-map-unit className={styles.unit} />)}
    <span className={styles.queen} data-map-queen title="Queen" />
    <span className={styles.distance} data-map-scale />
  </aside>;
}
