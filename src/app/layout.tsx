// Global CSS first: it declares Tailwind's layer order before any component CSS loads.
import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";
import { site } from "@/content/site";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SmoothScroll } from "@/components/layout/smooth-scroll";
import { LiquidGlassEnhancer } from "@/components/ui/liquid-glass-enhancer";
import { IntroRevealScript } from "@/features/intro-reveal";
import { TransitionLayer } from "@/features/tissue-transition";
import { JsonLd, organizationSchema, websiteSchema } from "@/lib/seo/json-ld";
import { manrope, outrun } from "./fonts/fonts";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: "en",
    url: "/",
    title: site.name,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
  },
};

export const viewport: Viewport = {
  // Phones get the milder orange of tokens.css, so the browser bar matches the page.
  themeColor: [
    { media: "(max-width: 47.99rem)", color: site.themeColorSmall },
    { color: site.themeColor },
  ],
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">): React.ReactElement {
  return (
    // The intro script sets data-intro and CSS variables on <html> before hydration.
    <html lang="en" className={`${outrun.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body id="top">
        <IntroRevealScript />
        <SiteHeader />
        {/* The page wrapper: the mobile menu presses it back as one card (globals.css). */}
        <div data-page>
          {children}
          <SiteFooter />
        </div>
        <TransitionLayer />
        <LiquidGlassEnhancer />
        <SmoothScroll />
        <JsonLd data={organizationSchema()} />
        <JsonLd data={websiteSchema()} />
      </body>
    </html>
  );
}
