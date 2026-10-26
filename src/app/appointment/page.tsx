import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = {
  title: "Appointment",
  description:
    "Book a call with Drimindesign. Pick a time that suits you to talk through your brand, website or motion project with the studio team.",
  alternates: { canonical: "/appointment" },
};

export default function AppointmentPage(): React.ReactElement {
  return <PagePlaceholder title="Appointment" />;
}
