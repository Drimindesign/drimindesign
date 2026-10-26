"use client";

import { useActionState, useState } from "react";
import { appointmentCopy, STUDIO_TIME_ZONE_LABEL } from "@/content/appointment";
import { SERVICES } from "@/content/inquiry";
import { Button } from "@/components/ui/button";
import { ConsentCheckbox } from "@/components/ui/consent-checkbox";
import { bookAppointment } from "../actions";
import type { AppointmentField, AppointmentResult } from "../schema";
import styles from "../appointment.module.css";

export interface BookingDay {
  day: string;
  label: string;
  slots: { iso: string; time: string; taken: boolean }[];
}

const LABELS: Record<Exclude<AppointmentField, "slot" | "consent">, string> = {
  name: "Your name",
  email: "Your email",
  topic: "What the call is about",
  note: "Anything we should know first? (optional)",
};

function describedBy(field: AppointmentField, state: AppointmentResult | null): { "aria-invalid"?: true; "aria-describedby"?: string } {
  return state && !state.ok && state.errors[field] ? { "aria-invalid": true, "aria-describedby": `booking-${field}-error` } : {};
}

function Booking({ days, onBooked }: { days: BookingDay[]; onBooked: () => void }): React.ReactElement {
  const [state, action, pending] = useActionState(bookAppointment, null);

  if (state?.ok) {
    const booked = days.flatMap((day) => day.slots.map((slot) => ({ ...slot, label: day.label }))).find((slot) => slot.iso === state.slot);
    const when = booked ? `${booked.label} at ${booked.time} ${STUDIO_TIME_ZONE_LABEL}` : "Your call is booked";
    return (
      <div className={styles.success} role="status">
        <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" className={styles.check}>
          <circle cx="24" cy="24" r="22" />
          <path d="M14 25l7 7 13-15" />
        </svg>
        <p className="mt-6 text-heading-xl font-semibold tracking-tight">{appointmentCopy.successTitle(state.name)}</p>
        <p className="mt-3 max-w-[44ch] text-body-lg">{appointmentCopy.successBody(when)}</p>
        <Button variant="ghost" size="md" className="mt-8" onClick={onBooked}>
          {appointmentCopy.again}
        </Button>
      </div>
    );
  }

  const values = state && !state.ok ? state.values : {};
  const errors = state && !state.ok ? state.errors : {};
  const firstOpen = days.find((day) => day.slots.some((slot) => !slot.taken && slot.iso === values.slot))?.day ??
    days.find((day) => day.slots.some((slot) => !slot.taken))?.day;
  const messages = (["slot", "name", "email", "topic", "note", "consent"] as const).filter((field) => errors[field]);

  return (
    <form action={action} noValidate className={styles.form}>
      <div className={styles.calendar}>
        <fieldset>
          <legend className={styles.legend}>{appointmentCopy.dayLegend}</legend>
          <div className={styles.days}>
            {days.map((day) => (
              <label key={day.day} className={styles.dayChip}>
                <input type="radio" name="day" value={day.day} defaultChecked={day.day === firstOpen} className="sr-only" />
                <span>{day.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.groups}>
          {days.map((day) => (
            <fieldset key={day.day} className={styles.group} {...describedBy("slot", state)}>
              <legend className={styles.legend}>{appointmentCopy.timeLegend(day.label)}</legend>
              {day.slots.every((slot) => slot.taken) ? (
                <p className="text-body text-ink-500">{appointmentCopy.noTimes}</p>
              ) : (
                <div className={styles.times}>
                  {day.slots.map((slot) => (
                    <label key={slot.iso} className={styles.timeChip}>
                      <input
                        type="radio"
                        name="slot"
                        value={slot.iso}
                        disabled={slot.taken}
                        defaultChecked={slot.iso === values.slot}
                        className="sr-only"
                      />
                      <span>{slot.time}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
        </div>
      </div>

      <fieldset className={styles.details}>
        <legend className={styles.legend}>{appointmentCopy.detailsLegend}</legend>
        <label className={styles.field}>
          <span>{LABELS.name}</span>
          <input name="name" autoComplete="name" defaultValue={values.name} {...describedBy("name", state)} />
        </label>
        <label className={styles.field}>
          <span>{LABELS.email}</span>
          <input name="email" type="email" autoComplete="email" defaultValue={values.email} {...describedBy("email", state)} />
        </label>
        <label className={styles.field}>
          <span>{LABELS.topic}</span>
          <select name="topic" defaultValue={values.topic ?? ""} {...describedBy("topic", state)}>
            <option value="" disabled>
              Choose
            </option>
            {SERVICES.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </label>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>{LABELS.note}</span>
          <textarea name="note" rows={3} maxLength={600} defaultValue={values.note} {...describedBy("note", state)} />
        </label>
      </fieldset>

      <ConsentCheckbox
        id="booking-consent"
        errorId={errors.consent ? "booking-consent-error" : undefined}
        defaultChecked={values.consent === "on"}
      />

      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="booking-website">Website</label>
        <input id="booking-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div aria-live="polite" className={styles.errors}>
        {messages.length > 0 && (
          <ul>
            {messages.map((field) => (
              <li key={field} id={`booking-${field}-error`}>
                {errors[field]}
              </li>
            ))}
          </ul>
        )}
        {errors.form && <p>{errors.form}</p>}
      </div>

      <Button type="submit" size="lg" className="mt-8" disabled={pending}>
        {pending ? appointmentCopy.sending : appointmentCopy.submit}
      </Button>
    </form>
  );
}

/*
 * The booking flow: a day, a time (in the studio's zone), a few details. Plain radios and
 * fields posted to a Server Action, so it works before hydration too; picking a day shows
 * its times with CSS alone. Errors are announced and tied to their fields. "Book another"
 * remounts with fresh state.
 */
export function BookingForm({ days }: { days: BookingDay[] }): React.ReactElement {
  const [round, setRound] = useState(0);
  return <Booking key={round} days={days} onBooked={() => setRound((value) => value + 1)} />;
}
