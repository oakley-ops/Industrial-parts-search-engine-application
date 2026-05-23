# Real Live Data — API Roadmap

This document outlines the path from demo mode to live vendor data. The short version: Grainger has no public API, but McMaster-Carr does, and several free alternatives exist for electronic/industrial components.

---

## Current State

`DEMO_MODE=true` returns hardcoded data for a 6203-2RS bearing regardless of what the user searches. All three Playwright scrapers (Grainger, Motion, McMaster) are blocked by bot detection:

| Vendor | Block Method |
|---|---|
| Grainger | Imperva/Incapsula (enterprise-grade) |
| McMaster-Carr | Requires login to view prices |
| Motion Industries | URL structure changed + bot detection |

---

## Vendor API Status

### Grainger
**Verdict: No public API available**

Grainger only offers B2B EDI integration through third-party platforms (TrueCommerce, SPS Commerce, Orderful). There is no self-service developer program. To integrate with Grainger you would need to negotiate a direct partnership — not realistic for an independent project.

**Workaround:** Grainger owns Zoro.com but Zoro also has no documented public API.

---

### McMaster-Carr ✅ Best option for this app
**Verdict: API exists, requires approval**

McMaster-Carr has a documented Product Information API that returns pricing, specs, inventory status, CAD files (STEP/DWG), and images.

- **Contact:** eprocurement@mcmaster.com
- **Auth:** Client certificate + bearer token (24-hour expiry)
- **Docs:** https://www.mcmaster.com/help/api
- **Postman collection:** Included in their onboarding
- **Rate limits:** Bandwidth limits on CAD file downloads only

**What you get:** Product search by part number, real-time pricing, availability, full product specs. This would replace the McMaster scraper with a legitimate API call.

**To apply:**
1. Email eprocurement@mcmaster.com and describe your use case
2. They review and provision a client certificate
3. Use the bearer token endpoint to authenticate each session

---

### Motion Industries
**Verdict: No public API**

Motion Industries operates through EDI/B2B partnerships only. No developer program exists.

---

## Better Alternatives (New Vendors)

If the goal is real live data, these vendors have open APIs that are easier to access than the three original scrapers:

### DigiKey (Free, Easy)
- **URL:** https://developer.digikey.com
- **Registration:** Create a DigiKey account, create a sandbox app — instant access
- **Cost:** Free
- **Data:** Real-time pricing, inventory, product search, datasheets
- **Auth:** OAuth 2.0 with API key
- **Coverage:** Electronic/electrical components (relays, sensors, motors, connectors) — overlaps heavily with industrial maintenance

### Mouser Electronics (Free)
- **URL:** https://www.mouser.com/api-hub
- **Registration:** Sign up at api-hub, contact automation.services@mouser.com
- **Cost:** Free
- **Data:** Product search, real-time availability, current pricing, datasheets
- **Coverage:** Same as DigiKey — electronic and electrical components

### OEMSecrets (Free, Aggregated)
- **URL:** https://www.oemsecrets.com/api
- **Registration:** Apply for a free API key on their site
- **Cost:** Free
- **Data:** Pulls pricing and inventory from 40+ distributors simultaneously — DigiKey, Arrow, Mouser, Farnell, RS, Avnet, Future Electronics
- **Auth:** API key
- **Coverage:** 40+ million parts
- **Note:** This is the highest-leverage option — one API call returns prices from dozens of vendors

### Element14 / Newark (Free)
- **URL:** https://partner.element14.com
- **Registration:** https://partner.element14.com/member/register
- **Cost:** Free
- **Data:** Product search, pricing, inventory across 40+ regional stores (Newark in the US)
- **Auth:** 24-character API key for basic access; HMAC-SHA1 for contract pricing
- **Output:** JSON or XML

---

## Recommended Path Forward

### Phase 1 — Quick win (1–2 days)
Integrate **OEMSecrets API**. Single free API key, returns data from 40+ distributors at once. Replace the demo data with real live results for electronic/electrical industrial components.

### Phase 2 — McMaster-Carr (1–2 weeks, depends on approval)
Email McMaster-Carr at eprocurement@mcmaster.com. Describe the app. If approved, replace the McMaster Playwright scraper with their official API. This gives you one verified, legitimate live vendor.

### Phase 3 — DigiKey + Mouser
Add DigiKey and Mouser as vendors in the app. Both have free APIs with instant registration and good documentation. This expands vendor coverage significantly.

### Phase 4 — Grainger (if needed)
Grainger would require a formal business partnership or going through a third-party EDI platform. Not worth pursuing until the app has real traction.

---

## Code Changes Required

To swap a scraper for an API integration:

1. Replace the `BaseScraper` Playwright class with an HTTP client (Axios) calling the vendor's REST API
2. Map the API response to the existing `SearchResult` and `PriceResult` interfaces in `base.scraper.ts`
3. Remove the `DEMO_MODE` flag once at least one live API is working
4. Keep demo mode as a fallback (`DEMO_MODE=true`) for portfolio demos when API keys aren't set

The `VendorsService` and all controller/frontend code stays exactly the same — only the scraper implementations change.

---

## Summary

| Vendor | API | Cost | Effort |
|---|---|---|---|
| McMaster-Carr | Yes — requires approval | Free | Email to apply, ~1 week |
| DigiKey | Yes — instant | Free | Register + API key same day |
| Mouser | Yes — instant | Free | Register + API key same day |
| OEMSecrets | Yes — instant | Free | Apply for key same day |
| Grainger | No — EDI/B2B only | N/A | Needs business partnership |
| Motion Industries | No | N/A | Needs business partnership |
