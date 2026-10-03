# MakeChurchEasy — Pricing Strategy & Tier Redesign

## 1. Executive Summary & Why the Current Pricing Fails

The current pricing page displays **$5/mo** ($60 billed yearly) and **$12.5/mo** ($150 billed yearly). 

### The Core Problem:
1. **USD Sticker Shock**: In Nigeria, $12.5/month is approximately **₦19,000 – ₦21,000/month**, and $150/year is **₦230,000+ upfront**. 
   - For an average church media volunteer or pastor of a 50–300 member church, asking for $12.5/month or ₦20,000/month creates immediate rejection when they are accustomed to cracked EasyWorship or free OpenLP.
2. **Missing Purchasing Power Parity (PPP)**: While the backend (`shared/subscription/sourceOfTruth.ts`) has some NGN structures, the frontend defaults to USD. If a Nigerian user lands on the page and sees `$`, bounce rates spike immediately.
3. **Mismatched Value Packaging**: Compute-heavy features (AssemblyAI speech-to-text) and zero-marginal-cost features (Bible projection, worship lyrics, local OBS dock) are mixed together without protecting your margins.

---

## 2. Unit Economics & Cost Analysis

Your assessment of your infrastructure costs is accurate, provided you treat AI streaming properly:

| Cost Item | Nature of Cost | Monthly Impact for 1,000 Churches | Margin Risk |
| :--- | :--- | :--- | :--- |
| **Cloudflare Workers / Pages / R2** | Fixed / Negligible | $5 – $15 total | **Zero Risk** (Virtually $0 per user) |
| **Local App / OBS Dock / Presentation Engine** | Client-side execution | $0 (Runs on user's laptop) | **Zero Risk** |
| **Database / Supabase / Next.js API** | Fixed / Low Tier | $25 – $50 total | **Low Risk** |
| **AssemblyAI (Speech-to-Scripture)** | **Variable per minute** (~$0.15–$0.30/hr) | $1,500 – $3,000+ if unmetered | **HIGH RISK** |

### The AssemblyAI Calculation:
- A typical church has **1.5 to 2 hours of preaching/speaking** per week = ~8 hours a month.
- At **$0.25/hour**, 8 hours of live audio stream = **$2.00 (~₦3,200) in raw API cost per church**.
- **Crucial Rule**: If you charge ₦3,000/month and include unlimited real-time AssemblyAI streaming, you will operate at a net loss on every active church.
- **The Solution**: 
  - The entry/basic tier must **NOT** include live continuous voice streaming (or give only a 15–30 min monthly sample).
  - Voice AI should belong to the premium tier OR be funded via **pay-as-you-go credit top-ups**.

---

## 3. How Big Tech / AI Systems Price (ChatGPT Model)

As you noted with ChatGPT (7K, 20K, 150K / $7, $20, $100), successful SaaS companies segment by:

1. **The Impulse Entry Tier**: Low friction (e.g. ₦2,900 – ₦3,500). Anyone with a debit card can approve it without committee meetings. Covers unlimited zero-cost software tools.
2. **The "Sweet Spot" Growth Tier**: Targeted at active teams who need productivity boosters (remote phone control, imports, multi-device). Priced at ₦6,000 – ₦7,500.
3. **The Power / AI Pro Tier**: Walled off for organizations with real budgets who consume server compute (live audio streaming, transcripts, translation). Priced at ₦14,000 – ₦18,000.

---

## 4. Proposed 3-Tier Segmentation

```
┌─────────────────────────────────┐   ┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│         STARTER / BASIC         │   │        GROWTH (Recommended)     │   │            CHURCH PRO           │
│      "Essential Projection"     │   │       "Media & Remote Team"     │   │      "Broadcast & Voice AI"     │
│                                 │   │                                 │   │                                 │
│   ₦2,900 / mo  ($3.00)          │   │   ₦6,500 / mo  ($6.50)          │   │   ₦14,500 / mo ($15.00)         │
│   ₦29,000 / year (Save 2 mos)   │   │   ₦65,000 / year (Save 2 mos)   │   │   ₦145,000 / year (Save 2 mos)  │
└─────────────────────────────────┘   └─────────────────────────────────┘   └─────────────────────────────────┘
```

### Tier 1: Starter / Basic (`₦2,900 / month` or `~$3.00`)
*Target Audience: Small churches, church plants, fellowships wanting to replace PowerPoint or cracked software.*

- **Included**:
  - Full Bible search & projection (KJV, NIV, AMP, NLT, unlimited versions).
  - Worship library & lyrics management (unlimited songs).
  - Media & background slideshows (images, videos).
  - Lower-thirds & OBS Dock integration.
  - Up to 2 registered presentation computers.
  - Local Wi-Fi phone control (basic slide forward/back).
- **Excluded**:
  - ❌ No Speech-to-Scripture live streaming.
  - ❌ No internet/cloud remote control (local network only).
  - ❌ No EasyWorship / ProPresenter bulk migration tools.
- **Unit Economics**: Cost to serve is **~$0.00**. At 10,000 churches, this represents **₦29,000,000/month (~$18,000/mo) in near 100% gross profit**.

---

### Tier 2: Growth (`₦6,500 / month` or `~$6.50`) — *Best Value Anchor*
*Target Audience: Growing churches, active media teams who need flexibility and remote control.*

- **Included**:
  - Everything in Starter.
  - **Internet & Cloud Mobile Remote Control**: Control slides and scripture from anywhere over mobile data/internet (not just local Wi-Fi).
  - **Bulk Import**: 1-click import from EasyWorship, ProPresenter, and OpenLP song databases.
  - **Ministry Tools**: Countdown clocks, service timers, and animated tickers.
  - Up to 5 team members & devices.
  - **Starter Voice AI Credits**: 100 monthly credits (~1 hour of speech detection for special services).
- **Excluded**:
  - ❌ Unlimited automated transcription / sermon translation.
- **Unit Economics**: Average server cost is <$0.30 per user. Gross profit margin is >95%.

---

### Tier 3: Church Pro (`₦14,500 / month` or `~$15.00`)
*Target Audience: Large churches, multi-campus ministries, broadcast & livestream departments.*

- **Included**:
  - Everything in Growth.
  - **Full Speech-to-Scripture**: Up to 12 hours of live preaching voice AI per month (covers all Sunday and midweek services).
  - **Sermon Export & Transcription**: Auto-generate sermon notes, transcripts, and multilingual translations.
  - **Cloud Sync & Backup**: Automatic synchronization across sanctuary, overflow, and children's church computers.
  - Up to 15 team members & devices.
  - Priority WhatsApp & phone support for Sunday emergencies.
- **Unit Economics**: AssemblyAI cost is ~$2.50 to $3.50; gross margin is **₦9,000 to ₦10,000 per church**.

---

## 5. The "Phone Control Over the Internet" Feature

### How it works technically:
- Currently, MakeChurchEasy includes a mobile PWA (`/mobile`) that communicates with the desktop app.
- For **Local Wi-Fi**, it connects over your local router's IP/WebSocket.
- For **Internet / Cloud Control** (e.g. Pastor is on MTN/Airtel 4G while the laptop is on church Wi-Fi):
  - The desktop app registers a pairing session with your Cloudflare / Next.js backend (`/api/pairing/stream`).
  - The mobile app sends commands to the API, which relays them in real-time (<50ms) to the church laptop.
  - **Pricing Position**: Package **Local Wi-Fi** control into Starter, and **Global Internet / Cellular** remote control into Growth. This creates a strong incentive for pastors to choose the Growth tier.

---

## 6. Top-Up Packs: Eliminating Runway Cost Risk

To ensure AssemblyAI costs never eat into your subscription revenue:
- Never offer "unlimited" voice transcription on any plan.
- Offer **Voice AI Hour Packs** as one-time top-ups:
  - **5 Extra Preaching Hours**: ₦2,000 (~$1.30) — raw cost to you: ~$1.00.
  - **15 Extra Preaching Hours**: ₦5,000 (~$3.20) — raw cost to you: ~$2.50.
- If a church has an extended 7-day revival or convention, they purchase a top-up pack. Your costs remain 100% protected.

---

## 7. Recommended Implementation Checklist

1. **Auto-Detect Region in `/subscription/plans`**:
   - Ensure users in Nigeria are immediately shown **₦ (NGN)** pricing rather than falling back to USD.
2. **Prominent Local Payment Methods**:
   - Explicitly display: *"Pay with Bank Transfer, USSD, or Debit Card (via Paystack / Flutterwave)"*.
3. **Annual Incentive**:
   - Highlight **"2 Months Free"** when paying annually:
     - Starter: **₦29,000/year** (saves ₦5,800)
     - Growth: **₦65,000/year** (saves ₦13,000)
     - Pro: **₦145,000/year** (saves ₦29,000)
4. **Update Shared Source of Truth**:
   - Update `shared/subscription/sourceOfTruth.ts` and `dashboard/app/(dashboard)/subscription/plans/new_plans_page/Newplans_page.tsx` with these updated tier limits and pricing profiles.
