import { InlineScript } from "@/components/ui/inline-script";
import { introScript } from "./intro-script";

/* Render once, as the first child of <body>, so it runs before anything paints. */
export function IntroRevealScript(): React.ReactElement {
  return <InlineScript html={introScript} />;
}
