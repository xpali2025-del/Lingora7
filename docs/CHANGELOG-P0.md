# P0 remediation (from the SEO & technical audit)

| ID | Change | Verified by |
|---|---|---|
| C1 | `Reviews` validates `r.ok`/array; `Safe` error boundary around `BuyBox`/`Reviews` | Chromium: API 500 -> H1, Buy button and article intact, 0 page errors |
| C2 | `extractClientIp` (trusted-hop / dedicated header), fail-closed in production, shared by all rate limits | `http.test.js`; HTTP test: spoofed XFF prefixes share one bucket (429 on 11th) |
| C3 | CSRF origin compared with `SITE_URL` host; redirects built on the public origin | `http.test.js`; admin login/2FA/action smoke over HTTP, evil origin -> 403 |
| C4 | `SITE_URL` Docker build arg; `seo:check` fails on localhost leaks / wrong canonicals | negative test with wrong SITE_URL -> 96 failures |
| S1 | Header, footer, visible breadcrumbs on every page; real home hub page (in sitemap) | `seo:check`: every indexable page has >= 3 inbound links |
| C6/S7 | `/en/how-to-redeem/` written (hreflang with the AR guide) | `seo:check`: 0 broken internal links |
| S2 | hreflang groups: ar-EG/ar-SA/ar-AE, en/en-GB (+x-default), how-to AR/EN | `seo:check`: reciprocal, self-referencing |
| C7/C10 | `<html lang dir>` per route (multiple root layouts), favicon.ico/icon.svg, 1200x630 OG image, summary_large_image, global 404 | `seo:check`, Chromium |
| S3 (partial) | `Organization` + `WebSite` JSON-LD on home (email only). **Still needs your real contact / legal-entity data** | — |
| C8 | Markets `ar`, `ar-qa` seeded as draft/disabled until they have landing pages | seed |
| extra | Product JSON-LD gains `image`, `brand`, `sku` | built HTML |

Not done in P0 (by design, next phase): real `lastmod`, server-rendered reviews, DB-driven prices, return-policy markup, market-page expansion, keyword re-mapping.

# P1 (implemented)

| ID | Change | Verified by |
|---|---|---|
| 11 | Keyword map re-done: country-qualified secondaries, no overlaps; `content-check` fails on any duplicated primary/secondary keyword per language | negative test (duplicate keyword + wrong price -> 2 failures) |
| 12 | 5 market pages expanded with local value + `local_facts` (>= 3) and a 350-word floor; similarity still < 5% | `content-check` |
| 13 | Approved reviews are server-rendered (ISR) and emitted as `Review` JSON-LD; no AggregateRating | HTTP test: review absent before approval, present in HTML + JSON-LD after |
| 14 | Price single source of truth: BuyBox + Product JSON-LD read the DB; admin save revalidates pages; CI parity vs `db/seed.sql` | HTTP test: price 14 -> 13 reflected within seconds |
| 15 | Real `lastmod` from `last_modified` front-matter (enforced) | sitemap |
| 16 | Product: `hasMerchantReturnPolicy` (MerchantReturnNotPermitted + link to refund policy; exceptions are on that page) | built HTML |
| 17 | `npm run indexnow` + `/indexnow-key/`; GSC/Bing steps in README | — |
| fix | `dynamicParams=true` on content pages (needed for on-demand revalidation; unknown URLs still 404) | HTTP test |
| fix | DB connection timeout (5 s) so a down database cannot hang builds | — |

Honest gaps: market pages are 350-480 authored words (target was 600-900); the remaining depth must come from real local data and real reviews. Check the `MerchantReturnNotPermitted` mapping with counsel, because the refund policy lists exceptions.
