# Home-page 3D loading

The hero stays server-rendered HTML and CSS. Device classification uses browser hints; it does not create disposable WebGL contexts. Actual scene contexts report software renderers back to the shared capability store.

The ring prepares after document load and the intro, when the section is within one viewport and the visitor has shown pointer, keyboard or scroll intent. Its GPU canvas warms below the fold on that intent, before scrolling when possible. Only the active and next project are explicitly prefetched. Team preparation starts three screens ahead; both scenes retain demand rendering and offscreen/hidden-tab pausing.

Wordmark bending strips are created on pointer intent, including the footer wordmark. Glass refraction maps are generated in a background worker only near the viewport, queued at idle and reused while dimensions are unchanged. The neutral-interior shortcut preserves the previous displacement pixels exactly. The one-second intro retains its physical path and easing; independent Suspense boundaries split section hydration. The falling-word teaser waits for pointer/touch intent, keeping Matter.js and its simulation out of an untouched initial page. Snap setup waits for ring preparation.

## Team assets

The card canvas design in `src/features/about-team/scene/card-art.ts` is the authoring source. Visitors load prebuilt WebP fronts, backs and straps at 320/640 px. Fixed texture buckets survive mobile URL-bar resizes; GPU uploads yield between textures. Failed asset or renderer initialization restores the HTML cards.

Run `npm run prepare:team-art` after changing team copy, portraits, fonts or card design. A local Chrome installation is required; set `CHROME_PATH` if it is not at the default path. Commit the generated manifest and artwork. The prebuild check rejects stale content/design and missing assets.

Run `npm run prepare:studio` to regenerate the original Three.js RoomEnvironment at sigma 0.04. Its exact half-float PMREM pixels are stored losslessly as gzip, so devices skip procedural-room rendering and cubemap filtering. Environment intensity, card materials, camera and lights are retained. Material shaders use parallel compilation before reveal where supported.

## Validation

Run `npm run build`, `npm run lint`, and `node --test scripts/test-scene-loading.mjs`. Measure Lighthouse against a production server, without another browser workload running concurrently. Check actual scrolling separately: Lighthouse's initial-navigation score does not measure the whole scrolling experience. Verify 360, 390, 768, 1024, 1440, 1920 and 2560 px layouts, reduced motion, drag/flip, navigation back, missing artwork and offscreen rendering.

## Recorded checks

The production build on Next.js 16.4.6 passed. Lighthouse 13.6.0, default mobile performance preset (simulated slow 4G and 4x CPU), measured **98**, LCP **1.1 s**, TBT **140 ms**, speed index **3.3 s**, and CLS **0** on localhost. The desktop preset measured **100**, LCP **0.3 s** and TBT **20 ms**. This measures initial navigation; cold GPU initialization still varies by device.

Browser checks passed at all seven required widths without horizontal overflow. Both 3D sections rendered; team-card tap/flip and drag, client navigation/back, reduced-motion cards, unavailable-WebGL fallbacks, and no-JavaScript content were verified. The ring stopped drawing while offscreen and the settled team stopped drawing. Four loading/cancellation/ownership tests passed. Refraction pixels matched the prior implementation byte-for-byte in 48 shape/size cases. Production bundle analysis completed.

Existing dependency warnings remain: R3F uses Three.Clock, which Three.js deprecates, and Next.js can warn about prefetched styles for unvisited routes. No uncaught browser errors or failed network requests were observed in the normal 3D smoke test.
