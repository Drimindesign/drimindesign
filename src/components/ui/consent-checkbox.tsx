import Link from "next/link";
import { consentCopy } from "@/content/legal";
import styles from "./consent-checkbox.module.css";

interface ConsentCheckboxProps {
  /** Element id: unique per form on the page. */
  id: string;
  /** Id of the error message when the box was left unticked. */
  errorId?: string;
  /** Ticked again after a failed submit (the form resets to its defaults). */
  defaultChecked?: boolean;
}

/*
 * The consent line shared by the inquiry and booking forms: a required checkbox (a clear,
 * affirmative choice) with links to the Privacy Policy and Terms. Its value is checked again
 * on the server. Colours follow the surface (currentColor), so it sits on the brand purple or white.
 */
export function ConsentCheckbox({ id, errorId, defaultChecked }: ConsentCheckboxProps): React.ReactElement {
  return (
    <div className={styles.consent}>
      <input
        id={id}
        name="consent"
        type="checkbox"
        value="on"
        required
        defaultChecked={defaultChecked}
        className={styles.box}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId}
      />
      <label htmlFor={id}>
        {consentCopy.before}{" "}
        <Link href="/privacy" className={styles.link} target="_blank">
          {consentCopy.privacy}
        </Link>{" "}
        {consentCopy.between}{" "}
        <Link href="/terms" className={styles.link} target="_blank">
          {consentCopy.terms}
        </Link>
        .
      </label>
    </div>
  );
}
