# Open questions

Moved verbatim from `PLAN.md` on 21 October 2026. New unknowns go here.

- **Car finance APR (slice 3a, CR-1 to CR-3, CR-10):** the statutory APR's equation of equivalence, time basis, included costs, rounding and treatment of a balloon are OPEN: SI 2010/1011, the regulator's handbook (CONC App 1) and the 2012 guidance PDF were refused by the network. The engine solves an effective rate (CFM21180) and does not call it APR. The owner reads the sources, or allows this environment to reach `www.legislation.gov.uk` and `www.handbook.fca.org.uk` (a network setting, not the build allowlist), before any page shows an "APR".
- **Car finance statutory rules (CR-12, CR-13):** voluntary termination (Consumer Credit Act 1974, sections 99 and 100) and early settlement (the 2004 regulations) are logged from secondary www.gov.uk pages only and not modelled.
- **Car finance engine decisions F5 to F14** are proposed, not yet confirmed: monthly periods in arrears, the rate basis choice, rounding, the effective rate on the PCP buy path, and the bounds (`src/calculators/car-finance/README.md`).
- Tax-config sources beyond www.gov.uk: allow `https://www.legislation.gov.uk/` (exact prefix, `.js` only) if a value is only published there? Widens the URL allowlist, so the owner decides. Not needed for 2026-27 (session E found every value on www.gov.uk).
- Slice 1a engine questions: O1 to O9 answered by the owner's decisions and sessions G1 and G2's GOV.UK lookups (`docs/modelling-decisions.md`). **Child Benefit weeks (O8, G4):** HMRC's press release of 31 March 2026 gives the 2026 to 2027 yearly amounts, each 52 times the weekly rate, matching the default; PAYE130030's method could still be read as 53 for the charge. The owner confirms or sets another count.
- Relief at source as a band extension (G2): now stated on GOV.UK (PTM056120, found in G2).
- Slice 1a is Done (marked in 1b-i at the owner's request); the 72 HMRC cross-checks in `docs/hmrc-cross-checks.json` are still pending.
- Taxable benefits in kind: the owner has not yet confirmed the value from an annual statement (decision B1); a payslip check over the year will show any mismatch.
- Percentage contributions round to the nearest penny (B6, a modelling decision: GOV.UK states no rule). If the owner's payslip shows a scheme rounding another way, change the one mode in `pageInputs.ts`.
- PAYE tables (O10, O11): Tables A (free pay per code) and Tables B to D (per-period rounding) are PDFs this environment cannot fetch. The estimate uses the HTML guidance's code times ten and rounds tax to date to the nearest penny (D3). The owner reads the tables, or allows the build environment to fetch assets.publishing.service.gov.uk, to confirm or correct.
- `paye.codeUnit` is a standing rule not tied to a tax year on its page (logged as such); the owner confirms it is acceptable as a verified leaf.
- A C (Welsh) code uses the England, Wales and Northern Ireland bands while GOV.UK gives the same Welsh rates; a year where they differ needs a Welsh band leaf first.
- The owner's payslip check (manual, B15): the PAYE estimate, the salary sacrifice benefit treatment and the monthly breakdown against a real payslip.
- The alternative annual allowance for 2023-24 onwards: PTM056510 says £30,000, the MPAA guidance and Pension schemes rates say £50,000. Not used (money purchase savings only); matters only if defined benefit savings are modelled.
- HMRC cross-checks: 72 cases in `docs/hmrc-cross-checks.json` wait for the owner's figures from HMRC's calculators.
- Estimated payslip net pay (0.12.0, U8) swaps only income tax for the PAYE estimate. The Child Benefit charge is usually collected through Self Assessment, not payroll, and a relief at source contribution is paid from the bank, so a real payslip would show neither; the owner decides whether payslip net pay should leave them out (a page-only change, no engine change).
- URL-hash state sharing (a shareable link of inputs, local only): in or out.
- Coverage target for pure calculator code.
- Sumyard name and domain availability.
- Which calculator after Phase 1: take-home pay now ships with 1b; compound interest is the likely next.

