Give Opencode a strict implementation spec, not design suggestions:

⸻

Redesign This Upgrade Modal Exactly

Delete the current layout completely.

Do not keep:

* Media card
* Devices card
* Premium card
* Comparison table
* Multiple bordered sections

Start from scratch.

⸻

Modal Dimensions

max-width: 850px;
width: 100%;
padding: 32px;
border-radius: 20px;

⸻

Layout Structure

Exactly:

┌─────────────────────────────────────┐
│                                     │
│              👑                     │
│                                     │
│        Upgrade Required             │
│                                     │
│ Unlock up to 70 songs, media        │
│ and premium features.               │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  [FREE]          [BASIC]            │
│                                     │
├─────────────────────────────────────┤
│                                     │
│      What You'll Unlock             │
│                                     │
│   ✓ 70 Songs                        │
│   ✓ 70 Images                       │
│   ✓ 70 Videos                       │
│   ✓ 5 Devices                       │
│   ✓ AI Features                     │
│   ✓ MultiView                       │
│   ✓ Mobile Control                  │
│                                     │
├─────────────────────────────────────┤
│                                     │
│ Maybe Later    Upgrade to Basic     │
│                                     │
└─────────────────────────────────────┘

Nothing else.

⸻

Header

Center aligned.

👑
Upgrade Required
Unlock up to 70 songs, media and premium features.

Spacing:

display:flex;
flex-direction:column;
align-items:center;
gap:12px;
margin-bottom:32px;

Title:

font-size:42px;
font-weight:700;

Subtitle:

font-size:18px;
opacity:0.8;
max-width:500px;
text-align:center;

⸻

Plan Cards Row

Exactly 2 cards.

display:grid;
grid-template-columns:1fr 1fr;
gap:20px;
margin-bottom:32px;

⸻

Free Card

Content:

FREE
Current Plan
3 Songs
3 Images
3 Videos
1 Device

Card styling:

padding:24px;
border-radius:16px;
background:var(--surface);
min-height:180px;

⸻

Basic Card

Content:

MOST POPULAR
Basic
₦8,500/month
70 Songs
70 Images
70 Videos
5 Devices
AI Features
MultiView
Mobile Control

Card styling:

padding:24px;
border-radius:16px;
min-height:180px;
border:2px solid var(--primary);
background:rgba(primary,0.08);

⸻

Remove These

Delete:

MEDIA
DEVICES
PREMIUM

Delete:

3 → 70

Delete:

tables
rows
columns
comparison grids

Delete everything.

⸻

Benefits Section

Single card.

What You'll Unlock

Then:

✓ Store up to 70 songs
✓ Store up to 70 images
✓ Store up to 70 videos
✓ Connect up to 5 devices
✓ Access AI Features
✓ Use MultiView
✓ Control OBS from Mobile

Styling:

padding:24px;
border-radius:16px;
background:var(--surface);
margin-bottom:32px;

Each benefit:

height:44px;
display:flex;
align-items:center;
gap:12px;

⸻

Footer

Fixed layout.

display:flex;
justify-content:space-between;
align-items:center;
padding-top:24px;
border-top:1px solid var(--border);

Left:

Maybe Later

Right:

Upgrade to Basic

⸻

Upgrade Button

height:52px;
padding:0 24px;
font-size:16px;
font-weight:600;
border-radius:12px;

Primary color.

No giant button.

No tiny button.

⸻

Final Acceptance Criteria

The modal must contain only:

1. Header
2. Two pricing cards
3. One benefits card
4. Footer buttons

Nothing else.

No tables.
No comparison grids.
No Media/Devices/Premium sections.
No floating buttons.
No dashboard-style boxes.

Rebuild it exactly as specified above.