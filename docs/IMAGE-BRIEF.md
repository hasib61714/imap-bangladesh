# Image brief

Every picture the product has a place for, what it is called, how big, and a
prompt to generate it with.

**Nothing here is required.** `src/components/AppImage.jsx` draws the
brand-coloured tile when a file is absent, so you can produce these one at a
time and each one lands as an improvement. There is no broken intermediate
state and no order you have to follow.

---

## Start here

**`IMAGE-PROMPTS.md` is what you paste into the generator.** Twenty-seven
self-contained prompts, one per image, with the house style already inside
each one.

Pasting THIS file into a generator does not work: it is a specification, and a
generator handed a long specification tends to read it as a document to edit
rather than an instruction to follow. This file explains what each image is
for and why; that one is the input.

---

## How to use this

1. Generate the image.
2. Save it as **`.webp`**, at the pixel size given, with the exact filename.
3. Drop it in `frontend/public/img/<folder>/`.
4. Reload. That is the whole process — no code change.

The paths are declared once in `frontend/src/constants/images.js`. If you want
a different filename, change it there.

### Format and size

- **WebP.** Smaller than JPEG at the same quality, supported everywhere that
  matters. Most generators export PNG — convert with Squoosh
  (<https://squoosh.app>), or any converter. Quality 78–82 is the sweet spot.
- **Keep each file under 180 KB.** These load on a phone on mobile data in
  Bangladesh. A 2 MB hero is not a nicer hero, it is a blank screen for four
  seconds.
- Pixel sizes below are **twice** the size they display at, so they stay sharp
  on a phone screen.

---

## House style — put this in every prompt

The nineteen category images sit in one grid. If they are generated in
different styles the grid looks assembled rather than designed, which is worse
than having no images at all. Paste this into every prompt:

> Clean, warm, natural photography. Real Bangladeshi people and settings —
> Dhaka apartments, local streets, everyday homes. Soft daylight, no harsh
> flash. Muted, natural colour with a slight green cast that suits a
> deep-emerald brand (#006A4E). Shallow depth of field, subject clearly in
> focus. No text, no logos, no watermarks. No stock-photo staging: no
> thumbs-up, no forced grins at the camera, no white studio backgrounds.
> Photographed at eye level, as if by someone who was there.

**And the constraint that matters most:** these are pictures of a service
being done, not portraits of a smiling worker. A plumber's hands under a sink
tells the customer what they are buying. A man in a branded polo shirt
grinning at the lens tells them nothing.

---

## 1. Service categories — 19 images

**Folder:** `frontend/public/img/category/`
**Size:** 800 × 500 px (16:10)
**Where:** the category grid on the landing page, and the services page. This
is the first grid a visitor scrolls to, so it is the set worth doing first.

| File | Category | Prompt (append the house style) |
|---|---|---|
| `emergency.webp` | জরুরি সেবা | An ambulance at night on a Dhaka street, doors open, warm interior light spilling out. Urgency without alarm. |
| `home-maintenance.webp` | গৃহ রক্ষণাবেক্ষণ | Close on a hand tightening a pipe fitting under a kitchen sink, torch light, a wrench and a cloth beside it. |
| `cleaning.webp` | পরিষ্কার সেবা | Sunlight across a freshly mopped tiled floor in a Dhaka flat, a bucket and cloth at the frame's edge, everything clean and still. |
| `healthcare.webp` | স্বাস্থ্যসেবা | A home nurse taking an elderly woman's blood pressure in her own sitting room, both hands visible, calm and unhurried. |
| `education.webp` | শিক্ষা সেবা | A tutor and a school-age child over an open exercise book at a dining table, afternoon light, the child writing. |
| `moving.webp` | স্থানান্তর ও পরিবহন | Two people carrying a wrapped mattress down an apartment stairwell, a small truck visible through the doorway. |
| `food.webp` | রান্না ও খাবার | A cook plating home-style Bangladeshi food in a domestic kitchen — steam, a steel pot, hands mid-serve. |
| `professional.webp` | পেশাদার পরামর্শ | Two people across a small desk with documents and a laptop between them, one explaining, the other listening. |
| `security.webp` | নিরাপত্তা সেবা | A uniformed guard at a residential building gate at dusk, checking a register. Calm and routine. |
| `errands.webp` | দৈনন্দিন সহায়তা | Hands passing a cloth bag of groceries across a doorway threshold, a rickshaw blurred behind. |
| `elderly.webp` | বয়স্ক সেবা | A carer's hand supporting an elderly man's forearm as he stands from a chair. Warm, close, respectful. |
| `childcare.webp` | শিশু ও পরিবার | A carer sitting on the floor with a toddler and wooden blocks, both looking at the blocks, not the camera. |
| `agro.webp` | কৃষি ও গ্রামীণ সেবা | Hands inspecting rice seedlings in a nursery tray at the edge of a field, early morning. |
| `events.webp` | ইভেন্ট ও ব্যক্তিগত | Hands tying marigold garlands onto a doorway frame before a family event. Detail, not the crowd. |
| `lifestyle.webp` | ব্যক্তিগত জীবনধারা | A tailor's hands guiding fabric under a sewing machine needle, thread spools out of focus behind. |
| `repair.webp` | মেরামত ও প্রযুক্তি | A technician's hands with a screwdriver inside an opened air-conditioner unit on a wall. |
| `digital.webp` | স্মার্ট ও ডিজিটাল সহায়তা | An older person's hands on a smartphone with a younger person's hand pointing at the screen, teaching. |
| `utility.webp` | ইউটিলিটি ইনস্টলেশন | A plumber fitting a water line to a rooftop tank, Dhaka rooftops behind. |
| `beauty.webp` | বিউটি ও সালোন | Hands applying mehendi to a woman's palm, close and detailed. |

---

## 2. Hero background — 1 image

**File:** `frontend/public/img/hero/hero-bg.webp`
**Size:** 1920 × 1080 px
**Where:** behind the landing-page headline, **under the existing gradient**.

> A wide view of a Dhaka residential neighbourhood in soft late-afternoon
> light — apartment balconies, a quiet street, a few people going about
> ordinary business. Nobody looking at the camera. Nothing in sharp focus at
> the centre, because a headline sits there.

**Read this before generating:** the gradient over this image is what gives
the white headline its 4.55:1 contrast. It is deliberately heavy (95% opacity)
so that ANY photograph underneath stays legible. The image will read as
texture and depth, not as a picture you can make out in detail. That is the
job. Choose something with a calm, even middle rather than a strong focal
point that will be buried.

---

## 3. How it works — 4 images

**Folder:** `frontend/public/img/steps/`
**Size:** 900 × 600 px (3:2)
**Where:** the four step cards, landing page and app.

| File | Step | Prompt |
|---|---|---|
| `step-1-browse.webp` | Browse services | Someone on a sofa scrolling a phone, relaxed, the screen not readable. Home, evening, unhurried. |
| `step-2-register.webp` | Register | A phone held close, a hand typing into a simple form. Screen content not legible. Quick and undramatic. |
| `step-3-book.webp` | Confirm booking | A phone with a calendar-like screen, a finger about to tap. Close, screen content not legible. |
| `step-4-service.webp` | Service done | A householder and a worker at a doorway at the end of a job — a handshake or a nod, toolbag on the floor. |

---

## 4. Trust section — 1 image

**File:** `frontend/public/img/trust/verification.webp`
**Size:** 1000 × 700 px

> Hands holding a Bangladeshi national ID card over a desk, another person's
> hands making a note beside it. The ID's details are not legible — angled
> away, or softly out of focus.

**Do not generate a readable ID card.** A legible national ID number in a
marketing image, real or invented, is the exact thing this platform exists to
protect. Angle it, blur it, or crop the number out entirely.

---

## 5. Empty portfolio — 1 image

**File:** `frontend/public/img/empty/portfolio.webp`
**Size:** 800 × 500 px

> A simple, quiet still life of a few clean hand tools laid on a wooden
> surface. Sparse, calm, plenty of empty space.

Shown to a provider who has not uploaded work samples yet, so it should feel
like an invitation rather than a fault.

---

## 6. Link preview — 1 image

**File:** `frontend/public/img/social/og-share.webp`
**Size:** 1200 × 630 px — this is a fixed standard, do not vary it.
**Where:** WhatsApp, Facebook and Messenger previews when someone shares a
link. Referenced from `frontend/index.html`, not from a component.

> The hero photograph, darkened, with clear space in the middle third.

The title and description come from the page's meta tags — the platforms draw
those themselves. **Do not put text in the image.** It will be duplicated,
and it will be cropped differently on each platform.

---

## What is NOT needed

- **Provider photographs.** Providers upload their own. Without one they get
  initials on a colour derived from their name, which is stable — the same
  person is the same colour in every list. Generated stock faces standing in
  for real providers would be the same class of thing as the fabricated
  testimonials that were removed.
- **Icons.** All 109 are line art from the icon set already in the bundle.
  See `frontend/src/components/Icon.jsx`.
- **App and PWA icons.** `frontend/public/icons/` already has them.

---

## When you have generated a few

Drop them in and reload — no build step, no code change. To check they are
being picked up, open DevTools → Network and filter on `img/`: a file that is
present loads with 200, and one that is not is simply not requested, because
`AppImage` falls back before asking.
