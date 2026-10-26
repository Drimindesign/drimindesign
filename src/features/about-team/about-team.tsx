import { aboutIntro, team } from "@/content/team";
import styles from "./about-team.module.css";
import { IdCard } from "./id-card";
import { LanyardStage } from "./lanyard-stage";

/*
 * Section 4: who we are. The studio's intro, then the team as ID cards hanging from a rail
 * on lanyards: they drop in on their straps as the section arrives, swing when dragged and
 * flip to their backs when tapped. The real text lives in the HTML; the 3D is enhancement.
 */
export function AboutTeam(): React.ReactElement {
  return (
    <section id="team" data-surface="light" aria-labelledby="team-title" className={styles.section}>
      <div className={styles.copy}>
        <p className="text-label font-medium tracking-[0.08em] text-orange-600 uppercase">{aboutIntro.eyebrow}</p>
        <h2 id="team-title" className="mt-4 max-w-[18ch] text-heading-xl font-semibold tracking-tight text-balance">
          {aboutIntro.title}
        </h2>
        <p className="mt-5 max-w-[46ch] text-body-lg text-pretty text-ink-600">{aboutIntro.body}</p>
      </div>

      <LanyardStage team={team} hint={aboutIntro.hint}>
        <ul className={styles.cards} aria-hidden="true">
          {team.map((member, index) => (
            <IdCard key={member.name} member={member} index={index} />
          ))}
        </ul>
      </LanyardStage>

      <ul className="sr-only">
        {team.map((member) => (
          <li key={member.name}>
            {member.name}, {member.role}. {member.bio}
          </li>
        ))}
      </ul>
    </section>
  );
}
