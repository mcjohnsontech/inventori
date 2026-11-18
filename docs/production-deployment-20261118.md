# Production deployment — 18 November 2026

Owner authorization: **“pull to main and deploy to production.”** Production is live at **https://infentri.dayari.ng/**. Staging remains independently available at https://dayari-inventory-staging.vercel.app/ with its Render API and PostgreSQL.

## Revision and publication

- Source: **6b852225af42fef8e9b5a722a808ce62ab8c2b1e**, first tested/pushed to staging; its staging frontend build reached READY before promotion.
- Main was fast-forwarded from b7172d351650374108380be1d3d29714c7e5d232 to that exact revision. No force push, history rewrite or unrelated workspace changes were included.
- Production Vercel project: dayari-inventory-production / prj_e7qeUPA9LpSm3BzCvw8wD2xJBAFL.
- Production deployment: **dpl_ASKzqQv1kZtJYmMdhQdDe8zh56xS**, READY and manually promoted. Project target read-back confirms this deployment is current.
- Deployment URL: https://dayari-inventory-production-f1zjthxma-mc-johnsons-projects.vercel.app . The supported sign-in origin is the custom domain.
- Retained Heroku app: **dayari-inventory-staging-api**; its legacy name does not describe its new production role. API: https://dayari-inventory-staging-api-797073a989e1.herokuapp.com .
- Heroku source release **v20** and production configuration release **v21** both succeeded. Slug source matches the promoted commit.

## Release-only implementation

The previous Procfile helper intentionally rejected production. Added a dispatcher preserving that helper and a production guard requiring explicit release authorization, a production Heroku release process, the retained SHOP origin, a separate nonlocal/non-Render database, the approved production URL and disabled or verified SMTP.

The production path runs **prisma migrate status**, never migrate deploy: pending migrations fail rather than being applied implicitly. Bootstrap is never called by startup or release. The first source release installed the dispatcher under the pre-existing staging configuration; its migration helper found all 33 migrations already applied. The configuration release then used the new read-only production path. This ordering matters because [Heroku runs release tasks for config-var changes too](https://devcenter.heroku.com/articles/release-phase).

Implementation files: Procfile; scripts/heroku-release.mjs; scripts/production-environment.mjs; scripts/production-environment.d.mts; tests/unit/staging-deployment.test.ts. No dependency, schema, migration, catalogue/SKU/QR identity, stock permission or ledger-rule change was introduced.

## Backup and preservation

Heroku logical backup **b005** completed before publication. The API was temporarily in maintenance mode and restored after preservation verification. Read-only repeatable-read snapshots captured full-row hashes and counts for **all 71 public tables**, including migration history.

Every table fingerprint and every migration record matched afterward. Retained records include **4 users, 1 receipt, 13 stock units and 7 stock movements**. No stock adjustment, historical enrollment, account creation/reset or schema migration occurred in production. Product/Lot/Unit/SKU identities, accepted evidence, print history and account hashes remain intact.

DATABASE_URL, SHOP_NODE_ID, invitation encryption key and SMTP credentials were retained. The intended cutover settings are DAYARI_DEPLOYMENT=production, APP_PUBLIC_URL=https://infentri.dayari.ng, explicit release approval, and removal of the old staging-mail rollout marker. No new paid database/dyno was created.

Private rollback configuration, row-hash evidence, source archive and provider metadata are under ignored .local/production-cutover-20261118. Never commit that directory. A rollback requires compatible configuration as well as the prior slug; config changes can persist even after a release-task failure. Rollback does not authorize rewriting ledger history.

## Continued separation and release gates

Production API_URL and APP_ORIGIN were verified using Vercel's current environment-value endpoint, without displaying values. Production points only to Heroku; no database credential is configured in its frontend. Render retains its distinct staging database/origin with invitations disabled. Staging accounts/passwords were not copied to production; existing production users keep their retained Heroku credentials.

The one authorized production build used an explicit ignored-build override. The project block **exit 0** was restored immediately afterward, and Auto-assign Custom Production Domains remains **false**. Publication was a separate explicit promotion. Main's automatic build was canceled by the guard as intended. Future staging pushes do not publish production; further production releases require explicit approved deployment/promotion. Render's free staging database still expires on 17 December 2026.

## Actual checks

| Check | Result |
|---|---|
| Complete local unit suite | **97/97 passed, 31 files** |
| Typecheck | Passed |
| Local API build | Passed |
| Hosted staging frontend build of promoted revision | READY |
| Heroku build and v20/v21 release phases | Succeeded |
| Production frontend build and manual promotion | Succeeded |
| Database preservation | All 71 tables and migration records unchanged |
| Live HTTP checks | **27/27 passed** |
| Production browser | Sign-in fields rendered; zero console errors |

HTTP checks covered production frontend/health, all 12 referenced script assets, five unauthenticated direct API denials, five unauthenticated proxy denials, foreign-Origin sign-in rejection, and staging frontend/API availability. No production password was entered, stock-changing workflow exercised or real invitation sent by smoke testing. This is not a claim of a new operational pilot or all-role production E2E run.

GitHub Verify Dayari workflows remained **in progress** when live checks completed: [main](https://github.com/mcjohnsontech/inventori/actions/runs/44219779567), [staging](https://github.com/mcjohnsontech/inventori/actions/runs/44219528453). Their integration/browser results are not claimed passed. No test/workflow was disabled or weakened. Local unit/typecheck/release checks and builds passed before promotion.

Screenshot: private local .local/production-cutover-20261118/production-sign-in.png. Detailed provider/smoke results are retained alongside it.

## Remaining limitations

- Existing Heroku database encrypted transport/provider no-verify setting is retained; this was not a transport-hardening change and adds no global TLS bypass.
- The previously recorded credential-rotation follow-up remains open; SMTP/database/encryption credentials were preserved, not rotated or exposed by this release.
- Previously issued invitations may contain the former staging URL. No immutable payload was rewritten or bulk resend performed. Use the existing authorized production Resend flow to replace an old invitation.
- GitHub protected-branch review rules, operational pilot, hardware certification and deferred cloud approvals/synchronization/local-server infrastructure remain outside this release.
- Unrelated dirty .gitignore, generated Next typings, earlier progress/decision notes and count screenshot remain preserved and uncommitted. No further feature work was started.
