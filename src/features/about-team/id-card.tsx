import Image from "next/image";
import type { CSSProperties } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import type { TeamMember } from "@/content/team";
import styles from "./about-team.module.css";

interface IdCardProps {
  member: TeamMember;
  index: number;
}

/*
 * The HTML ID card: the server-rendered base layer, and what stays on screen without WebGL
 * or with reduced motion. Same print as the 3D card's texture (scene/card-art.ts).
 */
export function IdCard({ member, index }: IdCardProps): React.ReactElement {
  return (
    <li className={styles.hanger} style={{ "--i": index } as CSSProperties}>
      <span className={styles.strap} />
      <div className={styles.pass}>
        <span className={styles.slot} />
        <div className="flex items-center gap-2">
          <BrandMark className="h-4 w-auto text-orange-500" />
          <span className="text-[0.625rem] font-semibold tracking-[0.06em]">DRIMINDESIGN</span>
          <span className="ml-auto text-[0.5625rem] font-medium tracking-[0.06em] text-ink-500">STUDIO PASS</span>
        </div>
        <div className={styles.portrait}>
          {/* Same file the 3D card prints (scene/card-art.ts): one download serves both. */}
          <Image src={member.photo} alt="" fill unoptimized className="object-cover" />
        </div>
        <p className="mt-3 text-heading-md font-semibold tracking-tight">{member.name}</p>
        <p className="text-body-sm font-medium text-ink-500">{member.role}</p>
        <p className="mt-auto flex justify-between border-t border-ink-100 pt-2 text-[0.5625rem] font-medium tracking-[0.06em] text-ink-500">
          <span>SINCE {member.since}</span>
          <span>ID {String(index + 1).padStart(4, "0")}</span>
        </p>
      </div>
    </li>
  );
}
