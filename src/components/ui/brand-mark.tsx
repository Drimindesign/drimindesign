import type { SVGProps } from "react";
import { BRAND_MARK_PATHS, BRAND_MARK_VIEWBOX } from "./brand-mark-paths";

/* Drimindesign logo mark. Fills use currentColor so the caller sets it. */
export function BrandMark(props: SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg viewBox={BRAND_MARK_VIEWBOX} fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      {BRAND_MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
