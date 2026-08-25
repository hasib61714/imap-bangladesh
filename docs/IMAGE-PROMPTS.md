# Ready-to-paste image prompts

Twenty-seven prompts, one per image. Each one is **complete on its own** —
copy a single block, paste it into Gemini (or any generator), download the
result. Do not paste the whole file.

`IMAGE-BRIEF.md` is the specification: what each image is for, where it
appears, and why. **This file is the input.** If you only read one, read this
one; if something looks wrong, the brief explains it.

## Why one prompt at a time

Pasting a long document makes the tool read it as a thing to be edited rather
than an instruction to be followed — which is exactly what happened on the
first attempt. Each block below is a single self-contained instruction with
the house style already inside it, so there is nothing to interpret.

## After each image

1. Download it.
2. Convert to **`.webp`** at <https://squoosh.app> — quality 80, and check the
   file is under 180 KB. (Drag in, pick WebP on the right, adjust quality,
   download.)
3. Rename to the exact filename in the heading.
4. Put it in the folder named in the heading.

Nothing else. No code change, no build step, no order to follow.

## If a result comes back wrong

The two failure modes to watch for, in order of how often they happen:

- **Someone smiling at the camera.** Add: *"The person is absorbed in the
  work and does not look at the camera."*
- **A Western kitchen, a white studio, an American street.** Add: *"Dhaka,
  Bangladesh. Local architecture, local clothing, local street furniture."*

Regenerate rather than accepting a near-miss. Nineteen category images sit in
one grid, and one that is stylistically off is more noticeable there than a
missing one — the fallback tile at least belongs to the design.

---

# 1–19 · Service categories

**Folder:** `frontend/public/img/category/` · **Size:** 800 × 500 px

---

### 1. `emergency.webp`

```
A 16:10 landscape photograph. An ambulance parked on a residential street in
Dhaka, Bangladesh at night, rear doors open, warm interior light spilling
onto the road. A paramedic's silhouette at the doorway, mid-movement.
Urgency without panic — nothing chaotic, nobody shouting.

Style: clean, warm, natural documentary photography. Real Bangladeshi setting.
Soft available light, no harsh flash. Muted natural colour with a slight green
cast. Shallow depth of field. Photographed at eye level, as if by someone who
was there. No text, no logos, no watermarks. Nobody looking at the camera.
```

---

### 2. `home-maintenance.webp`

```
A 16:10 landscape photograph. Close on a repair worker's hands tightening a
pipe fitting under a kitchen sink. A torch lies on the floor casting light
upward; an adjustable wrench and a cloth sit beside it. Only the hands and
forearms are in frame.

Style: clean, warm, natural documentary photography. Real Bangladeshi home.
Soft available light, no harsh flash. Muted natural colour with a slight green
cast. Shallow depth of field, the hands sharp. Photographed at eye level. No
text, no logos, no watermarks.
```

---

### 3. `cleaning.webp`

```
A 16:10 landscape photograph. Late-morning sunlight falling across a freshly
mopped tiled floor in a Dhaka apartment. A bucket and a folded cloth sit at
the edge of the frame. The room is empty, clean and still — the work has just
finished.

Style: clean, warm, natural documentary photography. Real Bangladeshi home.
Soft daylight through a window, no harsh flash. Muted natural colour with a
slight green cast. Photographed at eye level. No text, no logos, no
watermarks. No people.
```

---

### 4. `healthcare.webp`

```
A 16:10 landscape photograph. A home-care nurse taking an elderly Bangladeshi
woman's blood pressure in her own sitting room. Both pairs of hands visible,
the cuff on the woman's arm. Calm and unhurried; they are looking at the
cuff, not at the camera.

Style: clean, warm, natural documentary photography. Real Bangladeshi home
interior. Soft daylight, no harsh flash. Muted natural colour with a slight
green cast. Shallow depth of field. Photographed at eye level. No text, no
logos, no watermarks.
```

---

### 5. `education.webp`

```
A 16:10 landscape photograph. A private tutor and a school-age Bangladeshi
child at a dining table, an open exercise book between them. The child is
writing; the tutor is watching the page. Afternoon light from a window.

Style: clean, warm, natural documentary photography. Real Bangladeshi home.
Soft daylight, no harsh flash. Muted natural colour with a slight green cast.
Shallow depth of field. Photographed at eye level. No text on the page that is
legible. No logos, no watermarks. Neither person looks at the camera.
```

---

### 6. `moving.webp`

```
A 16:10 landscape photograph. Two workers carrying a wrapped mattress down an
apartment stairwell in Dhaka. A small covered truck is visible through the
open doorway below. Mid-movement, concentrating on the load.

Style: clean, warm, natural documentary photography. Real Bangladeshi
apartment building. Available light, no harsh flash. Muted natural colour with
a slight green cast. Photographed at eye level. No text, no logos, no
watermarks. Nobody looking at the camera.
```

---

### 7. `food.webp`

```
A 16:10 landscape photograph. A cook plating home-style Bangladeshi food in a
domestic kitchen — rice and a curry, steam rising, a steel pot beside the
plate. Hands mid-serve with a spoon. Only hands and the food in frame.

Style: clean, warm, natural documentary photography. Real Bangladeshi kitchen.
Soft daylight, no harsh flash. Muted natural colour with a slight green cast.
Shallow depth of field, the plate sharp. Photographed at eye level. No text,
no logos, no watermarks.
```

---

### 8. `professional.webp`

```
A 16:10 landscape photograph. Two Bangladeshi people either side of a small
desk with printed documents and a laptop between them. One is explaining,
gesturing at a page; the other is listening and looking at the document.

Style: clean, warm, natural documentary photography. Real Bangladeshi office
or home office — modest, not corporate. Soft daylight, no harsh flash. Muted
natural colour with a slight green cast. Photographed at eye level. Document
text not legible. No logos, no watermarks. Neither person looks at the camera.
```

---

### 9. `security.webp`

```
A 16:10 landscape photograph. A uniformed security guard at the gate of a
residential building in Dhaka at dusk, writing in a visitors' register on a
small desk. Warm gate lighting. Calm and routine — nothing is happening.

Style: clean, warm, natural documentary photography. Real Bangladeshi
residential building entrance. Available light at dusk, no harsh flash. Muted
natural colour with a slight green cast. Photographed at eye level. Register
text not legible. No logos, no watermarks. Not looking at the camera.
```

---

### 10. `errands.webp`

```
A 16:10 landscape photograph. Hands passing a cloth bag of vegetables across a
doorway threshold — one person handing over, one receiving. A rickshaw is
blurred in the street behind. Only hands, the bag and the doorway in focus.

Style: clean, warm, natural documentary photography. Real Dhaka residential
street. Soft daylight, no harsh flash. Muted natural colour with a slight
green cast. Shallow depth of field. Photographed at eye level. No text, no
logos, no watermarks.
```

---

### 11. `elderly.webp`

```
A 16:10 landscape photograph. A carer's hand supporting an elderly
Bangladeshi man's forearm as he rises from a chair in his sitting room. Close
on the two arms and hands. Warm, steady, respectful — assistance, not
dependence.

Style: clean, warm, natural documentary photography. Real Bangladeshi home.
Soft daylight, no harsh flash. Muted natural colour with a slight green cast.
Shallow depth of field. Photographed at eye level. No text, no logos, no
watermarks. Faces not the subject.
```

---

### 12. `childcare.webp`

```
A 16:10 landscape photograph. A carer sitting on the floor with a Bangladeshi
toddler, wooden building blocks between them. Both are looking at the blocks.
Domestic sitting room, toys nearby.

Style: clean, warm, natural documentary photography. Real Bangladeshi home.
Soft daylight, no harsh flash. Muted natural colour with a slight green cast.
Shallow depth of field. Photographed at eye level, low to the floor. No text,
no logos, no watermarks. Neither looks at the camera.
```

---

### 13. `agro.webp`

```
A 16:10 landscape photograph. A farmer's hands lifting a tray of young rice
seedlings at the edge of a field in rural Bangladesh, early morning. Green
seedlings, damp soil, mist low over the field behind.

Style: clean, warm, natural documentary photography. Real rural Bangladeshi
setting. Soft early daylight, no harsh flash. Muted natural colour with a
slight green cast. Shallow depth of field, the seedlings sharp. Photographed
at eye level. No text, no logos, no watermarks.
```

---

### 14. `events.webp`

```
A 16:10 landscape photograph. Hands tying orange marigold garlands onto a
doorway frame before a family celebration. Close on the hands, the flowers and
the door. The gathering itself is not in frame.

Style: clean, warm, natural documentary photography. Real Bangladeshi home
entrance. Soft daylight, no harsh flash. Muted natural colour with a slight
green cast. Shallow depth of field. Photographed at eye level. No text, no
logos, no watermarks.
```

---

### 15. `lifestyle.webp`

```
A 16:10 landscape photograph. A tailor's hands guiding fabric under a sewing
machine needle. Spools of thread out of focus behind. Close and concentrated —
only the hands, the fabric and the machine.

Style: clean, warm, natural documentary photography. Real Bangladeshi tailor's
workshop. Soft daylight, no harsh flash. Muted natural colour with a slight
green cast. Shallow depth of field, the needle sharp. Photographed at eye
level. No text, no logos, no watermarks.
```

---

### 16. `repair.webp`

```
A 16:10 landscape photograph. A technician's hands with a screwdriver inside
an opened wall-mounted air-conditioner unit. The cover is off, internal parts
visible. Close on the hands and the unit.

Style: clean, warm, natural documentary photography. Real Bangladeshi
apartment interior. Available light, no harsh flash. Muted natural colour with
a slight green cast. Shallow depth of field. Photographed at eye level. No
text, no logos, no watermarks. No brand markings on the unit.
```

---

### 17. `digital.webp`

```
A 16:10 landscape photograph. An older Bangladeshi person holding a
smartphone, with a younger person's hand pointing at the screen — being shown
how to do something. Close on both pairs of hands and the phone. The screen
content is not legible.

Style: clean, warm, natural documentary photography. Real Bangladeshi home.
Soft daylight, no harsh flash. Muted natural colour with a slight green cast.
Shallow depth of field. Photographed at eye level. No text, no logos, no
watermarks.
```

---

### 18. `utility.webp`

```
A 16:10 landscape photograph. A plumber fitting a water pipe to a rooftop
storage tank, Dhaka rooftops and water tanks stretching behind. Working, tools
at hand, mid-afternoon.

Style: clean, warm, natural documentary photography. Real Dhaka rooftop. Soft
daylight, no harsh flash. Muted natural colour with a slight green cast.
Shallow depth of field. Photographed at eye level. No text, no logos, no
watermarks. Not looking at the camera.
```

---

### 19. `beauty.webp`

```
A 16:10 landscape photograph. Hands applying mehendi in fine detail to a
woman's open palm. Very close, the pattern half finished, the cone in the
artist's fingers.

Style: clean, warm, natural documentary photography. Real Bangladeshi setting.
Soft daylight, no harsh flash. Muted natural colour with a slight green cast.
Shallow depth of field, the palm sharp. Photographed at eye level. No text, no
logos, no watermarks.
```

---

# 20 · Hero background

**Folder:** `frontend/public/img/hero/` · **File:** `hero-bg.webp` ·
**Size:** 1920 × 1080 px

```
A 16:9 wide landscape photograph. A residential neighbourhood in Dhaka,
Bangladesh in soft late-afternoon light — apartment balconies, a quiet
side street, a few people going about ordinary business at a distance.

Composition matters more than subject here: the CENTRE of the frame must be
calm and even, with no strong focal point, because a large headline sits over
it. Interest at the edges, quiet in the middle.

Style: clean, warm, natural documentary photography. Soft golden late-
afternoon light, no harsh flash. Muted natural colour with a slight green
cast. Wide depth of field. Photographed at eye level. No text, no logos, no
watermarks. Nobody looking at the camera.
```

**Note:** a heavy brand gradient sits over this at 95% opacity, so it will read
as depth and texture rather than as a picture you can make out. That is
intended — the gradient is what keeps the white headline legible.

---

# 21–24 · How it works

**Folder:** `frontend/public/img/steps/` · **Size:** 900 × 600 px

---

### 21. `step-1-browse.webp`

```
A 3:2 landscape photograph. Someone sitting on a sofa at home in the evening,
relaxed, scrolling a phone held in one hand. Warm lamp light. The screen
content is not legible. Unhurried, ordinary.

Style: clean, warm, natural documentary photography. Real Bangladeshi home.
Soft warm indoor light, no harsh flash. Muted natural colour with a slight
green cast. Shallow depth of field. Photographed at eye level. No text, no
logos, no watermarks. Not looking at the camera.
```

---

### 22. `step-2-register.webp`

```
A 3:2 landscape photograph. Close on two hands holding a phone, one thumb
typing into a simple form on screen. The screen content is not legible. Quick,
undramatic, everyday.

Style: clean, warm, natural documentary photography. Real Bangladeshi home
setting. Soft daylight, no harsh flash. Muted natural colour with a slight
green cast. Shallow depth of field, the phone sharp. Photographed at eye
level. No text, no logos, no watermarks.
```

---

### 23. `step-3-book.webp`

```
A 3:2 landscape photograph. Close on a phone held in two hands showing a
calendar-like screen, a finger about to tap. The screen content is not
legible — the shape reads as a calendar, the detail does not.

Style: clean, warm, natural documentary photography. Real Bangladeshi home
setting. Soft daylight, no harsh flash. Muted natural colour with a slight
green cast. Shallow depth of field. Photographed at eye level. No text, no
logos, no watermarks.
```

---

### 24. `step-4-service.webp`

```
A 3:2 landscape photograph. A householder and a service worker at an
apartment doorway at the end of a job — a handshake or a nod of thanks, a
toolbag on the floor beside them. Warm, brief, finished.

Style: clean, warm, natural documentary photography. Real Bangladeshi
apartment entrance. Soft daylight, no harsh flash. Muted natural colour with a
slight green cast. Photographed at eye level. No text, no logos, no
watermarks. Neither looks at the camera. No branded uniform.
```

---

# 25 · Trust section

**Folder:** `frontend/public/img/trust/` · **File:** `verification.webp` ·
**Size:** 1000 × 700 px

```
A landscape photograph. Two hands holding an identity card over a desk while
another person's hands make a note on a pad beside it. Close on the hands, the
card and the pad.

CRITICAL: the identity card must be angled away from the camera, or softly out
of focus, so that NO NUMBER OR NAME ON IT IS LEGIBLE. Not blurred as an
afterthought — composed so there is nothing to read.

Style: clean, warm, natural documentary photography. Real Bangladeshi desk
setting. Soft daylight, no harsh flash. Muted natural colour with a slight
green cast. Shallow depth of field. Photographed at eye level. No other text,
no logos, no watermarks.
```

**Why the constraint:** a legible national ID number in a marketing image,
whether real or invented, is the exact thing this platform exists to protect
people from. If the result has readable digits, regenerate it.

---

# 26 · Empty portfolio

**Folder:** `frontend/public/img/empty/` · **File:** `portfolio.webp` ·
**Size:** 800 × 500 px

```
A 16:10 landscape still life. A few clean hand tools — a screwdriver, pliers,
a folding rule — laid out with space between them on a plain wooden surface.
Sparse and calm, with a lot of empty space around them.

Style: clean, warm, natural photography. Soft daylight from one side, no harsh
flash. Muted natural colour with a slight green cast. Shallow depth of field.
Photographed from slightly above. No text, no logos, no watermarks. No people.
```

**Why this one is quiet:** it is shown to a provider who has not added work
samples yet. It should read as an invitation to fill the space, not as a
notice that something is missing.

---

# 27 · Link preview

**Folder:** `frontend/public/img/social/` · **File:** `og-share.webp` ·
**Size:** 1200 × 630 px — a fixed platform standard, do not vary it

```
A 1200x630 landscape photograph. A residential neighbourhood in Dhaka,
Bangladesh in soft late-afternoon light, darkened overall as if lit at dusk.
The middle third of the frame is visually quiet and uncluttered.

Style: clean, warm, natural documentary photography. Muted, slightly darkened
natural colour with a green cast. Wide depth of field. Photographed at eye
level. ABSOLUTELY NO TEXT, no logos, no watermarks, no captions of any kind.
```

**Why no text:** WhatsApp, Facebook and Messenger draw the title and
description from the page's meta tags and put them beside the image. Text in
the image is duplicated, and each platform crops it differently.

---

# Checklist

Tick these off as they land in `frontend/public/img/`:

```
category/    ☐ emergency          ☐ home-maintenance   ☐ cleaning
             ☐ healthcare         ☐ education          ☐ moving
             ☐ food               ☐ professional       ☐ security
             ☐ errands            ☐ elderly            ☐ childcare
             ☐ agro               ☐ events             ☐ lifestyle
             ☐ repair             ☐ digital            ☐ utility
             ☐ beauty

hero/        ☐ hero-bg
steps/       ☐ step-1-browse  ☐ step-2-register  ☐ step-3-book  ☐ step-4-service
trust/       ☐ verification
empty/       ☐ portfolio
social/      ☐ og-share
```

The nineteen categories are the set worth doing first — that grid is the first
thing a visitor scrolls to.
