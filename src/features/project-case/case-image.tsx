import Image, { getImageProps } from "next/image";
import { caseImageSrc, type CaseImage as CaseImageData } from "@/content/project-details";
import styles from "./project-case.module.css";

interface CaseImageProps {
  image: CaseImageData;
  /** `sizes` for the responsive image (how wide it is drawn at each breakpoint). */
  sizes: string;
  className?: string;
}

/*
 * A case-study image: its own aspect ratio reserved (no layout shift), and a slow settle as
 * it scrolls into view (CSS scroll-driven, on the compositor, no JavaScript).
 */
export function CaseImage({ image, sizes, className }: CaseImageProps): React.ReactElement {
  const { props: mobile } = getImageProps({ src: caseImageSrc(image, "small"), alt: image.alt, fill: true, sizes });
  return (
    <div className={`${styles.frame} ${className ?? ""}`} style={{ aspectRatio: image.ratio }}>
      <picture>
        <source media="(max-width: 47.99rem)" srcSet={mobile.srcSet} sizes={sizes} />
        <Image src={caseImageSrc(image, "full")} alt={image.alt} fill sizes={sizes} className={styles.image} />
      </picture>
    </div>
  );
}
