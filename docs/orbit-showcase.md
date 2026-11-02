# Idea to Orbit showcase

The home ring adds the game after the client projects. The static banner is loaded with the same 700 / 1000 / 1400 px WebP budgets as existing work. Play game and the panel open `/play`; the screen-reader project list includes the same link and agency credit. Camera zoom tuning is unchanged.

The bull and food-taming controls are removed. No lion or cub is included.

Soldiers use persistent vanguard, rear and close-guard slots, with at most two assigned to any opponent. Support damage is 42% of base strength with no recruitment rank multiplication. Soldiers pursue nearby fights, then run to regroup as the player advances. Relocation is restricted to well outside the view. Friendly ground bodies, including Gorr, use deterministic spacing and cannot shove the hero. Cages continue recruiting soldiers up to ten active members; further rescues heal the squad.

Endurance follows each character’s role and skill: Mage/Rogue 6 health, Ranger 7, Knight 10, Barbarian 12, Gorr 18, Dog 5. Ordinary enemy hits cost soldiers 2 health; heavy Brute/Chief blows cost 4. For example, a Mage falls after three ordinary hits, a Knight five, Gorr nine. Regeneration starts after ten quiet seconds and restores one point every three seconds. Existing wounded/rescue mechanics remain. Opponents also have a clear endurance ladder: Raider 3 ordinary sword hits, Brute 4, Chief 8; empowered strikes shorten these fights. Hero damage and camera zoom are unchanged.

## Artwork provenance

Generated with the built-in ImageGen tool using an actual `/play` gameplay screenshot as reference. Delivery: `public/projects/idea-to-orbit-v2-{700,1000,1400}.webp`.

Final prompt:

> Use case: ads-marketing. Create a polished game key-art banner for Idea to Orbit, a browser adventure developed by Drimindesign. Reference image: actual gameplay, preserve its distinctive silver angular vehicle, pixel-art night monsoon village, palms, mountains, warm window lights, moon and side-scrolling world. Elevate this into beautiful premium cinematic pixel-art promotional key art, finely controlled crisp pixels, atmospheric blue-black sky, subtle rain, wet road catching warm light, the silver vehicle as focal point with headlights cutting the mist. Composition landscape 7:5, all essential artwork in central 80%, strong readable silhouette. Typography: only 'IDEA TO ORBIT' in carefully spaced cream game-title lettering at upper center; no other words. No HUD, buttons, website frame, watermark, additional vehicles or invented characters. Rich layered depth, restrained amber highlights, predominantly midnight blue, image must remain legible at carousel thumbnail size.

## Validation

- Production build and ESLint pass. Nine squad/rendering regression tests pass.
- Showcase checked at 360, 390, 768, 1024, 1440, 1920 and 2560 px, including reduced motion and navigation to `/play`. No horizontal overflow or browser errors in those checks.
- Production mobile Lighthouse: Performance 70, Accessibility 100, Best Practices 100, SEO 100; LCP 1.1 s, CLS 0, TBT 2720 ms. The 95 performance target remains unmet because of main-thread startup work.
- Ring GPU setup and project-route prefetching now wait for the work section to enter view.
