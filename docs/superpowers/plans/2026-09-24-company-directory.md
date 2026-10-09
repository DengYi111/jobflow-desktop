# Offline Company Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned offline catalog of about 300 common mainland Chinese and foreign-funded employers, searchable by industry and aliases, with safe linking into local company records and job creation.

**Architecture:** Keep the catalog as validated, bundled read-only data under the main process. The company service owns search and import/link behavior; SQLite remains the only source of company IDs used by jobs. Expose narrow catalog operations through the existing validated IPC registry, then add a catalog view to company management and catalog-aware company selection to the job form.

**Tech Stack:** Electron, TypeScript, SQLite with Drizzle and SQL migrations, Zod IPC contracts, React, Ant Design, Vitest, Testing Library.

---

## File map

- `src/main/data/company-directory.json` — versioned industry and company records, including stable IDs, canonical names, aliases, and source notes.
- `src/main/services/company-directory.ts` — runtime parsing, catalog search, name normalization, and catalog integrity checks.
- `src/main/db/schema.ts` and `drizzle/0002_company_directory.sql` — optional industry and catalog-link columns and their indexes.
- `src/main/repositories/companies.repository.ts` — company CRUD and catalog-match persistence.
- `src/main/services/companies.service.ts` — category-aware listing and atomic import/link behavior.
- `src/shared/schemas/common.ts`, `src/shared/contracts/api.ts`, `src/main/ipc/register-handlers.ts`, and the company service wiring in `src/main/services/job-ipc-services.ts` — validated, typed IPC surface.
- `src/renderer/features/jobs/CompanyPage.tsx` — “我的公司 / 常见公司库” browsing, filtering, add/link actions, and industry editing.
- `src/renderer/features/jobs/JobForm.tsx` and `src/renderer/features/jobs/JobsPage.tsx` — search personal and catalog companies, link a selected catalog entry before job creation.
- `tests/unit/company-directory.test.ts` — catalog validation, normalization, search, and industry filter tests.
- `tests/integration/company-directory-ipc.test.ts` — migrations, matching, import, data preservation, IPC and job creation tests.
- `tests/unit/company-page-directory.test.tsx` and `tests/unit/job-form-company-directory.test.tsx` — user-visible company and job-form workflows.

## Task 1: Define and validate the bundled catalog

**Files:**
- Create: `src/main/data/company-directory.json`
- Create: `src/main/services/company-directory.ts`
- Create: `tests/unit/company-directory.test.ts`

- [ ] **Step 1: Write failing catalog validation and search tests**

Test that the directory contains 280–320 company records; has unique stable company IDs and industry IDs; each company references a declared industry; normalized canonical names and aliases do not collide across different records; search matches canonical names and aliases case-insensitively; and industry filtering returns only entries with the selected industry.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm exec vitest run tests/unit/company-directory.test.ts`
Expected: FAIL because the directory and service module do not exist yet.

- [ ] **Step 3: Add the data shape and validation/search service**

Use a top-level JSON object with `version`, `updatedAt`, `sources`, `industries`, and `companies`. Each industry has `id` and `nameZh`; each company has `id`, `name`, `aliases`, and `industryId`. Parse data with strict Zod schemas. Normalize names using Unicode NFKC, trim and collapse whitespace, lowercase Latin characters, and remove only recognized legal suffixes and punctuation in a stable, documented order. Expose `loadCompanyDirectory()`, `searchCompanyDirectory({ query?, industryId? })`, and `normalizeCompanyName(name)` from `src/main/services/company-directory.ts`. Reject invalid and ambiguous normalized names at load time with a Chinese-readable error.

- [ ] **Step 4: Add and verify the initial employer dataset**

Curate 280–320 records across the 18 industries in the design spec. Include mainland employers and foreign-funded employers operating in China. Use Fortune China 500 and Fortune Global 500 as discovery sources, with additional commonly recruited employers; retain source URLs and retrieval date in the catalog metadata. Do not copy rankings, revenue, employee counts, or article text. Manually inspect names, aliases, and industry assignments.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run tests/unit/company-directory.test.ts`
Expected: PASS for dataset counts, uniqueness, industry references, collision validation, aliases, normalization, and filtering.

Commit: `feat: add validated offline company directory`

## Task 2: Add industry and directory links to local company records

**Files:**
- Modify: `src/main/db/schema.ts`
- Create: `drizzle/0002_company_directory.sql`
- Modify: `src/main/repositories/companies.repository.ts`
- Modify: `src/main/services/companies.service.ts`
- Modify: `src/shared/schemas/common.ts`
- Modify: `tests/integration/database-schema.test.ts`
- Create: `tests/integration/company-directory-ipc.test.ts`

- [ ] **Step 1: Write failing migration and company matching tests**

Cover migration of an existing database while preserving company IDs, names, job foreign keys, and notes; new nullable `industry_id` and `directory_id` fields; link-first matching; unique canonical/alias matching; no-match creation; conflict on multiple local matches; repeated import idempotency; and preservation of existing user-entered company fields.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run tests/integration/database-schema.test.ts tests/integration/company-directory-ipc.test.ts`
Expected: FAIL on missing migration, fields, and company directory actions.

- [ ] **Step 3: Implement migration and repository operations**

Add nullable `industry_id` and `directory_id` columns and indexes without changing existing rows. Update the Drizzle declaration to match SQL. Add repository queries to find companies by `directory_id`, list active companies for exact normalized-name matching, and update a company’s directory link and missing industry in one update. Do not overwrite name, URLs, notes, timestamps unrelated to the update, or job relations while linking an existing record.

- [ ] **Step 4: Implement category-aware service operations**

Extend manual create/update/list inputs with optional `industryId`. Add `listDirectory({ query?, industryId? })` and `addFromDirectory({ directoryId })`. Resolve in this order: existing directory ID; otherwise unique match among local canonical company names and catalog aliases; otherwise create a local record with catalog canonical name and industry. On several matches, return a stable `COMPANY_MATCH_CONFLICT` error with enough company names for the UI to let the user choose; do not create another company. Perform resolve-and-link/create in a SQLite transaction.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run tests/integration/database-schema.test.ts tests/integration/company-directory-ipc.test.ts`
Expected: PASS while legacy company and job data remain unchanged.

Commit: `feat: link local companies to directory entries`

## Task 3: Expose catalog operations through typed, validated IPC

**Files:**
- Modify: `src/shared/schemas/common.ts`
- Modify: `src/shared/contracts/api.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/services/job-ipc-services.ts`
- Modify: `tests/unit/api-contract.test.ts`
- Modify: `tests/unit/ipc-security.test.ts`
- Modify: `tests/integration/company-directory-ipc.test.ts`

- [ ] **Step 1: Add failing IPC contract tests**

Verify company list accepts optional industry filters; directory search validates bounded query and known industry IDs; catalog import accepts only a stable directory ID; unknown methods/invalid payloads are rejected; a company directory entry cannot be supplied as a job’s `companyId`; and imported companies can be used as normal local job company IDs.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run tests/unit/api-contract.test.ts tests/unit/ipc-security.test.ts tests/integration/company-directory-ipc.test.ts`
Expected: FAIL because the directory IPC operations are not registered or typed.

- [ ] **Step 3: Wire schemas, service methods, and API contracts**

Add strict schemas for directory search (`query` up to 200 characters and optional `industryId`) and directory import (`directoryId` with a bounded stable-ID format). Add typed `companies.listDirectory` and `companies.addFromDirectory` API methods. Register only these methods in the validated handler map and wire them to the company service. Keep all database and file access in the main process.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run tests/unit/api-contract.test.ts tests/unit/ipc-security.test.ts tests/integration/company-directory-ipc.test.ts`
Expected: PASS with trusted-sender enforcement and existing company/job IPC behavior intact.

Commit: `feat: expose company directory over validated IPC`

## Task 4: Add the common directory to company management

**Files:**
- Modify: `src/renderer/features/jobs/CompanyPage.tsx`
- Create: `tests/unit/company-page-directory.test.tsx`

- [ ] **Step 1: Write failing company-page interaction tests**

Cover switching between “我的公司” and “常见公司库”; industry selection; search by alias; add from the catalog; already-added state; opening the linked local company; and showing a Chinese error when search or import fails. Verify manual create/edit exposes the optional industry field and does not remove URLs or notes.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm exec vitest run tests/unit/company-page-directory.test.tsx`
Expected: FAIL because the directory view and industry controls are absent.

- [ ] **Step 3: Implement the two-view company management screen**

Add “我的公司” and “常见公司库” tabs. In the catalog tab provide a name/alias search box, an industry filter with “全部行业”, industry labels, and a single add action. Track linked local records so repeated selection shows “已添加” and opens the local detail. Add industry to manual create/edit and personal-company display. Show loading, empty, success, and error states in Chinese; keep public directory data read-only.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run tests/unit/company-page-directory.test.tsx`
Expected: PASS for catalog browsing, import, error feedback, and manual company editing.

Commit: `feat: add company directory browser`

## Task 5: Connect directory search to job creation and verify the full feature

**Files:**
- Modify: `src/renderer/features/jobs/JobForm.tsx`
- Modify: `src/renderer/features/jobs/JobsPage.tsx`
- Create: `tests/unit/job-form-company-directory.test.tsx`
- Modify: `tests/integration/company-directory-ipc.test.ts`

- [ ] **Step 1: Write failing job form workflow tests**

Verify the company control can find both local and directory companies; choosing an unlinked directory result first imports it and passes the returned local company ID to job creation; choosing an already-linked entry reuses its local ID; and an import or ambiguity error prevents job creation and displays a Chinese message.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm exec vitest run tests/unit/job-form-company-directory.test.tsx`
Expected: FAIL because job company selection currently searches only local companies.

- [ ] **Step 3: Implement catalog-aware company selection**

Keep the existing local-company choices and add searchable directory results with industry labels. On selecting an unlinked directory entry, call the company import/link operation, wait for its local company ID, then continue the existing form submission. Do not create the job if import/link fails. Reuse a linked local company without creating another record.

- [ ] **Step 4: Verify end-to-end data and production build**

Run: `pnpm exec vitest run tests/unit/company-directory.test.ts tests/integration/company-directory-ipc.test.ts tests/unit/company-page-directory.test.tsx tests/unit/job-form-company-directory.test.tsx tests/integration/database-schema.test.ts`
Expected: PASS; the integration test confirms the created job references a persisted local company and existing unrelated records survive migration.

Run: `pnpm run build`
Expected: TypeScript and Vite production build complete successfully.

- [ ] **Step 5: Commit the completed flow**

Commit: `feat: use company directory in job forms`

## Self-review against the design

- Offline bundled catalog, industry definitions, aliases, stable IDs, source metadata, and data integrity: Task 1.
- Optional company industry and catalog link migration with legacy data preservation: Task 2.
- Canonical/alias linking, idempotent import, ambiguity handling, and read-only public records: Tasks 1–3.
- Validated main-process-only IPC and local company IDs as the job foreign key: Tasks 3 and 5.
- “我的公司 / 常见公司库”, manual company maintenance, and direct job form selection: Tasks 4 and 5.
- Chinese loading, empty, success, and failure feedback; offline search and industry filtering: Tasks 1 and 4.
- Tests for name normalization, case, whitespace, punctuation/suffixes, aliases, migration preservation, service, IPC, and UI flows: Tasks 1–5.

No spec requirements are intentionally omitted. The name-normalization implementation must document exactly which legal suffixes it strips and preserve meaningful names when stripping would create an ambiguous collision; startup validation and unit tests enforce this rule.
