interface PagePlaceholderProps {
  title: string;
}

/* Temporary page body for routes scheduled in later milestones (PRD.md §11). */
export function PagePlaceholder({ title }: PagePlaceholderProps): React.ReactElement {
  return (
    <main
      data-surface="dark"
      className="grid min-h-svh content-center gap-4 px-[var(--gutter)] pt-24 pb-[var(--gutter)]"
    >
      <h1 className="font-display text-display-xl text-fg-display uppercase">{title}</h1>
      <p className="max-w-[40ch] text-body-lg text-fg-muted">This page is being built.</p>
    </main>
  );
}
