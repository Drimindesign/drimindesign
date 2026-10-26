import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./select.module.css";

type SelectProps = ComponentPropsWithRef<"select"> & {
  /** Sentence blanks share the same picker as the boxed form fields. */
  variant?: "field" | "inline";
};

/** Native semantics and form submission, with a progressively enhanced, branded picker. */
export function Select({ variant = "field", className, children, ...props }: SelectProps): React.ReactElement {
  return (
    <span className={cn(styles.root, styles[variant])}>
      <select data-lenis-prevent="" {...props} className={cn(styles.control, className)}>
        {children}
      </select>
      <svg className={styles.chevron} viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
        <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
