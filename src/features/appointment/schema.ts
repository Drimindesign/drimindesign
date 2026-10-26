import { z } from "zod";
import { SERVICES } from "@/content/inquiry";

/* Shared by the booking form (client) and the server action: one source of truth for validation. */
export const appointmentSchema = z.object({
  slot: z.iso.datetime({ error: "Pick a time for the call." }),
  name: z.string().trim().min(2, "Tell us your name.").max(80, "That name is a little long."),
  email: z.email({ error: "That email doesn't look right." }).max(160),
  topic: z.enum(SERVICES, { error: "Pick what the call is about." }),
  note: z.string().trim().max(600, "Keep the note under 600 characters, please."),
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type AppointmentField = keyof AppointmentInput;
export const APPOINTMENT_FIELDS = ["slot", "name", "email", "topic", "note"] as const satisfies readonly AppointmentField[];

export type AppointmentValues = Partial<Record<AppointmentField, string>>;
export type AppointmentErrors = Partial<Record<AppointmentField | "form", string>>;

export type AppointmentResult =
  | { ok: true; name: string; slot: string }
  | { ok: false; errors: AppointmentErrors; values: AppointmentValues };

/** Field → first message, for inline errors. */
export function errorsOf(error: z.ZodError): AppointmentErrors {
  const errors: AppointmentErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && APPOINTMENT_FIELDS.includes(field as AppointmentField)) {
      errors[field as AppointmentField] ??= issue.message;
    }
  }
  return errors;
}
