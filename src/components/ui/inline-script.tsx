interface InlineScriptProps {
  html: string;
}

/*
 * Runs `html` synchronously during HTML parsing, before first paint, on hard loads only.
 * On the client the tag renders as text/plain, so soft navigations never re-run it and
 * React doesn't warn about rendering <script>. See
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export function InlineScript({ html }: InlineScriptProps): React.ReactElement {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
