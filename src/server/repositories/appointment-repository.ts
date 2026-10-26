import "server-only";
import type { AppointmentInput } from "@/features/appointment/schema";

/*
 * Where appointments are stored (AGENTS.md §9). UI and actions depend on this interface;
 * the in-memory implementation stands in until the database provider is chosen. A slot is
 * reserved atomically: here because check-and-set runs without awaiting, in the database
 * with a unique constraint on `slot`.
 */
export interface StoredAppointment extends AppointmentInput {
  id: string;
  createdAt: Date;
}

export interface AppointmentRepository {
  /** Slots (UTC ISO strings) already taken. */
  bookedSlots: () => Promise<ReadonlySet<string>>;
  /** Reserves the appointment's slot; null if someone else already has it. */
  reserve: (appointment: AppointmentInput) => Promise<StoredAppointment | null>;
}

class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly bySlot = new Map<string, StoredAppointment>();

  async bookedSlots(): Promise<ReadonlySet<string>> {
    return new Set(this.bySlot.keys());
  }

  async reserve(appointment: AppointmentInput): Promise<StoredAppointment | null> {
    if (this.bySlot.has(appointment.slot)) return null;
    const stored = { ...appointment, id: crypto.randomUUID(), createdAt: new Date() };
    this.bySlot.set(appointment.slot, stored);
    return stored;
  }
}

export const appointmentRepository: AppointmentRepository = new InMemoryAppointmentRepository();
