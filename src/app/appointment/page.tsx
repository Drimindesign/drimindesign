import type { Metadata } from "next";
import { AppointmentPage } from "@/features/appointment";

export const metadata: Metadata = {
  title: "Book a Call With a Branding and Web Design Agency",
  description:
    "Book a 30-minute call with Drimindesign to talk through your branding, website or app project. Pick a time that suits you and meet the people who'd design it.",
  alternates: { canonical: "/appointment" },
};

export default function Appointment(): React.ReactElement {
  return <AppointmentPage />;
}
