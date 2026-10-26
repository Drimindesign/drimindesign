# Project banner prompts (ChatGPT Images)

One **master image per project**. The same file is used everywhere a project appears: the ring panel, the Projects grid card, the tissue pull and the full-screen hero on its case-study page. So it has to read as a finished, premium "hero shot" at every size.

## How to use

1. Open ChatGPT (image generation) and start a **new chat per project**.
2. Attach that project's reference images: its real logo, business cards, signage photos or app screens. More references give better results. Include the logo as a clean file if you have one.
3. Paste the **master prompt** below, then paste that project's **project brief** under it.
4. Ask for 2–3 variations, pick one, then use the follow-ups at the bottom to fix details.
5. Save the chosen image as `assets/projects/<slug>-master.png` (for example `assets/projects/breeze-and-mist-master.png`). In `scripts/prepare-project-images.py`, point that project's `PROJECTS` entry at the new file and drop its `box` / `fill` / `mode` overrides (the master is already 7:5, so it's simply cropped to fill):

   ```python
   "breeze-and-mist": {"file": "breeze-and-mist-master.png"},
   ```

   Then run the script. It writes the 7:5 WebP sizes into `public/projects/` that the site already uses:

   ```bash
   python scripts/prepare-project-images.py
   ```

## What to attach

Rough photos are fine: the prompt asks ChatGPT to **rebuild the scene** from scratch and keep only the brand (logo, colours, text, screens). What matters most is giving it the *clean artwork* to copy, because it copies what it sees, blur and glare included.

Attach, in this order of importance:

1. **The clean logo**: the original file (SVG, PDF, AI export or a large PNG on a plain background). If you only have a photo, crop tightly to the logo.
2. **The flat artwork** of what's being shown: the print file or design export of the card/flyer/sign, or the app screens exported from Figma at full size. These are far better than photos of them.
3. **Your rough photos**, only to show the real object or place (shape, material, setting). Say in the chat: *"The photos are for reference only; rebuild the scene cleanly."*
4. **The brand colours**, if you know them, typed into the chat (e.g. "sage #8FA58A, off-white #F4F1EA").

| Project | Must attach | Nice to have |
|---|---|---|
| Munsey Pharmacy | Logo; business card artwork (front and back); flyer artwork | Your photos of the printed card and flyer; brand purple hex |
| Breeze and Mist | Logo and leaf monogram; business card artwork; the breeze pattern | Photos of the printed cards; sage green hex |
| Breeze and Grains | Logo; one photo of the building entrance and the lit sign (the clearest you have) | A daytime photo of the facade; the sign's artwork file |
| ShreeRam Milks | The four app screens as exports (welcome, sign-in, code, address); app logo/icon | Brand colours; a photo of their milk bottle or packaging |
| Speakora | The five onboarding screens as exports (username, interests, English test, reading test, completion); app logo | Brand colours |

If you have only rough photos for a print piece, generate in two steps: first ask *"Recreate this business card as clean, flat, front-facing artwork, exactly as designed"*, check the text and logo, then use that clean result as the reference for the hero shot.

## Why these framing rules

- **7:5 landscape** is the shape of the ring panels and grid cards.
- On a **phone**, the hero shows only the **middle ~40 % of the width** (cover crop), so the subject must be centred.
- On a **wide desktop** the hero crops a little off the top and bottom, so keep about 10 % of margin there.
- The pull starts by **pinching the top-right corner**, so that corner should be quiet: background, no text or logo.
- The site puts the project title over the **bottom-left** of the hero, so keep that area simple and fairly dark or calm.

---

## Master prompt (paste first, unchanged)

```text
Create one premium "hero shot" image for a design studio's portfolio, presenting the client project described below. Use the attached reference images as the source of truth: reproduce the real logo, colours, typography, layouts and screen designs faithfully. Do not invent a different logo, do not rename the brand, and do not add fake text. Any text that appears must be the real text from the references, spelled exactly.

Format and framing:
- Landscape, aspect ratio 7:5, very high resolution (at least 2800 × 2000 px).
- One clear hero subject, centred. Everything important (logo, product, key screen) must sit inside the central 40% of the width and the central 80% of the height, so it survives a tall phone crop and a wide desktop crop.
- Keep the top-right corner calm (background only, no text or logo).
- Keep the bottom-left quarter simple and low-detail; a title will be overlaid there.
- No borders, no frames, no watermarks, no captions, no UI chrome around the image.

Look and feel:
- Art-directed, editorial, "award-winning studio case study" quality, like the hero images on Behance featured projects or a top branding agency's website.
- Physical and tactile: real materials, real light, soft natural shadows, shallow depth of field, crisp focus on the hero subject.
- One coherent scene with a single light direction (soft key light from the upper left), photographic and realistic, not illustrated, not 3D-cartoon.
- Background built from the brand's own colours, with gentle tonal depth so the subject separates from it.
- Clean, uncluttered composition with generous negative space. Nothing that looks like generic stock imagery.

Output: one finished image, no text explanation needed.
```

---

## Project briefs (paste one under the master prompt)

### Munsey Pharmacy (`munsey-pharmacy`)

```text
Project: Munsey Pharmacy, a neighbourhood pharmacy. Brand collateral and print (business cards, service flyer).
References attached: the real business card and the purple flyer.
Scene: a top-down flat lay on a smooth surface in the brand's purple, lit softly from the upper left. Hero: the business card, front facing, sharp, centred, with its back peeking beneath it. Behind it, slightly out of focus and partly cropped, the purple services flyer. A few calm, clean pharmacy cues placed at the far edges (a small white paper bag, a blister pack, a sprig of green), kept subtle. Trustworthy, caring, clean and modern, never clinical.
```

### Breeze and Mist (`breeze-and-mist`)

```text
Project: Breeze and Mist, a calm resort. Brand identity: leaf-and-wind monogram, sage green, flowing breeze pattern, stationery.
References attached: the logo, monogram, pattern and business cards.
Scene: a neat stack of business cards in sage green, the top card showing the leaf monogram, standing slightly angled on a soft stone or linen surface. Gentle morning light from the upper left, with a soft shadow of leaves falling across the background. The breeze pattern appears subtly on a card back or an envelope beside the stack. Serene, airy, quiet luxury. Palette: sage green, warm off-white, natural stone.
```

### Breeze and Grains (`breeze-and-grains`)

```text
Project: Breeze and Grains, a resort. Signage and wayfinding: the illuminated sign over the entrance.
References attached: photos of the building and its illuminated sign, plus the logo.
Scene: the resort entrance at blue hour (dusk). The illuminated Breeze and Grains sign glows warmly over the entrance and is the clear focal point, centred and sharp, spelled exactly as in the references. Deep blue sky, warm light spilling from the entrance, a touch of tropical foliage framing the sides. Cinematic architectural photography, straight verticals, no people. Inviting, warm, hospitality at its best.
```

### ShreeRam Milks (`shreeram-milks`)

```text
Project: ShreeRam Milks, a milk-delivery app (welcome, phone sign-in, code verification, delivery address).
References attached: the real app screens.
Scene: three modern smartphones floating in a gentle arc, slightly tilted toward the viewer, each showing one of the real screens exactly as designed (the welcome screen in the centre, largest and sharpest). Soft studio background in a fresh cream-white with a pale blue or green tint taken from the app's colours. Beside the phones, softly out of focus, a glass milk bottle with morning light on it. Fresh, early-morning, friendly. Screens must be crisp and readable, not redesigned.
```

### Speakora (`speakora-onboarding`)

```text
Project: Speakora, an English-speaking learning app. Onboarding UX: username, interests, English test, reading test, completion.
References attached: the real onboarding screens.
Scene: a fan of three to five smartphones showing the real onboarding screens in sequence from left to right, the centre phone (the English test screen) largest and sharpest. Clean studio background in the app's brand colours with a soft gradient and gentle depth. A subtle sense of progress and encouragement (a soft glow behind the completion screen). Optimistic, friendly, confident. Screens must be crisp and readable, exactly as designed.
```

---

## Useful follow-ups

- "Keep everything the same, but move the hero subject a little more to the centre and leave the top-right corner empty."
- "The logo text is slightly wrong. Copy it exactly from the attached logo, letter for letter."
- "Keep the screens exactly as in the references; don't redesign or re-letter them."
- "Make the background calmer and darker in the bottom-left so white text reads on it."
- "Same image, higher resolution, 7:5, at least 2800 × 2000."
