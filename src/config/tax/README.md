# Tax config

Per-tax-year config files (`<year>.ts`), a registry (`index.ts`) and the schema (`schema.ts`). Every leaf is `Sourced<T>` (`{ value, sourceUrl, verifiedOn }`). This is the only place tax rules live. Empty until slice 0.5; no value enters from memory (see `CLAUDE.md` > Accuracy rules).
