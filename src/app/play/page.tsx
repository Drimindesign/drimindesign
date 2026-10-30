import type { Metadata } from "next";
import { OrbitPage } from "@/features/orbit";

export const metadata: Metadata = {
  title: "Play",
  description:
    "Play Idea to Orbit by Drimindesign: explore a forest at dawn on foot, then take the thruster car down a rolling road. A pixel-art game for phones and laptops.",
  alternates: { canonical: "/play" },
};

export default function Play(): React.ReactElement {
  return <OrbitPage />;
}
