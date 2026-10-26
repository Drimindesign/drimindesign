import { Suspense } from "react";
import { appointmentCopy } from "@/content/appointment";
import styles from "./appointment.module.css";
import { Availability } from "./availability";

/*
 * The Appointment page: a light page with the title and the booking flow. Everything but
 * the open times is in the static shell; the times stream in (their placeholder keeps the
 * same height, so nothing jumps).
 */
export function AppointmentPage(): React.ReactElement {
  return (
    <main data-surface="light" className={styles.page}>
      <div className={styles.inner}>
        <p className="text-label font-semibold tracking-[0.08em] text-orange-600 uppercase">{appointmentCopy.eyebrow}</p>
        <h1 className={`${styles.title} mt-4 font-semibold tracking-tight text-balance`}>{appointmentCopy.title}</h1>
        <p className="mt-5 max-w-[48ch] text-body-lg text-ink-700">{appointmentCopy.intro}</p>
        <Suspense
          fallback={
            <p className={styles.loading} role="status">
              {appointmentCopy.loading}
            </p>
          }
        >
          <Availability />
        </Suspense>
      </div>
    </main>
  );
}
