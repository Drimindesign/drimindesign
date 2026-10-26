"use server";

import { headers } from "next/headers";
import { allow } from "@/server/rate-limit";
import { appointmentRepository } from "@/server/repositories/appointment-repository";
import { APPOINTMENT_FIELDS, appointmentSchema, errorsOf, type AppointmentResult, type AppointmentValues } from "./schema";
import { slotsFrom } from "./slots";

/** Three bookings per address per ten minutes. */
const LIMIT = 3;
const WINDOW_MS = 10 * 60 * 1000;

export async function bookAppointment(_previous: AppointmentResult | null, formData: FormData): Promise<AppointmentResult> {
  const values: AppointmentValues = {};
  for (const field of APPOINTMENT_FIELDS) values[field] = String(formData.get(field) ?? "");

  // Honeypot: people never see this field; bots fill it. Pretend it worked.
  if (String(formData.get("website") ?? "") !== "") return { ok: true, name: values.name ?? "", slot: values.slot ?? "" };

  // Cloudflare sets the visitor's address in cf-connecting-ip; other hosts in x-forwarded-for.
  const requestHeaders = await headers();
  const address =
    requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`appointment:${address}`, LIMIT, WINDOW_MS)) {
    return { ok: false, errors: { form: "That's a lot of bookings at once. Please try again in a few minutes." }, values };
  }

  const parsed = appointmentSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: errorsOf(parsed.error), values };

  // Only a time the calendar offers right now: never trust the submitted value.
  if (!slotsFrom(new Date()).some((slot) => slot.iso === parsed.data.slot)) {
    return { ok: false, errors: { slot: "That time isn't available any more. Pick another." }, values: { ...values, slot: "" } };
  }

  try {
    const stored = await appointmentRepository.reserve(parsed.data);
    if (!stored) {
      return { ok: false, errors: { slot: "Someone just booked that time. Pick another." }, values: { ...values, slot: "" } };
    }
  } catch {
    return { ok: false, errors: { form: "Something went wrong on our side. Please try again, or email us." }, values };
  }
  return { ok: true, name: parsed.data.name, slot: parsed.data.slot };
}
