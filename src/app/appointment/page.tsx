import type { Metadata } from "next";
import { AppointmentPage } from "@/features/appointment";

export const metadata: Metadata = {
  title: "Appointment",
  description:
    "Book a call with Drimindesign. Pick a time that suits you to talk through your brand, website or motion project with the studio team.",
  alternates: { canonical: "/appointment" },
};

export default function Appointment(): React.ReactElement {
  return <AppointmentPage />;
}
