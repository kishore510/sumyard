# Lib

Shared non-UI code: theme, storage (`storage.ts` with the `upgradeRecord` migration hook, `storageKeys.ts`), a small external store (`store.ts`), focus trapping, token reading, money (`money.ts`, integer pence), display formatting (`format.ts`) and ISO dates (`isoDate.ts`). See `docs/money.md`. Also: input parsing (`parse.ts`), untrusted-JSON checks (`validate.ts`) and file download and reading (`download.ts`). Scenarios live in `src/scenarios/`.
