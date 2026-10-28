# PostgreSQL Migration Integration Notes

This change adds PostgreSQL persistence support and migration/maintenance tooling to the existing BesimDesign application.

## Important data-safety boundary

The migration source repository contains a much larger SQLite database and a very large tombstone data file. Those files are intentionally **not** copied into this public repository. No production database has been migrated or modified as part of this code integration.

The checked-in `server/db/fusion.db` is not automatically assumed to be the correct or complete source database.

## Explicitly select a SQLite source file

Both maintenance tools require `SQLITE_SOURCE_PATH` so a command cannot silently operate on the repository's packaged database:

```bash
SQLITE_SOURCE_PATH="/absolute/path/to/verified-copy/fusion.db" node server/db/manage-data-safety.js --status
SQLITE_SOURCE_PATH="/absolute/path/to/verified-copy/fusion.db" node server/db/manage-data-safety.js --plan-clients
SQLITE_SOURCE_PATH="/absolute/path/to/verified-copy/fusion.db" node server/db/manage-data-safety.js --plan-enquiries
```

The cleanup actions remain destructive when paired with `--confirm`; do not use those flags until the database path and backups have been verified. The safety-tool backup is placed beside the selected SQLite file.

## Migration guard

The migration script also requires `SQLITE_SOURCE_PATH` and verifies the SQLite file header before connecting to PostgreSQL. Point it only to a separately verified source copy. The PostgreSQL destination must be selected using `DATABASE_URL` or `POSTGRES_URL`, kept in the local shell environment or deployment environment settings, and never committed.

Do not run the migration against production until the destination project is confirmed and a separate destination backup/export has been verified. The migration uses `ON CONFLICT DO NOTHING`; this avoids overwriting some existing rows, but it does not reconcile conflicting data or prove that source and destination records match.

## Deployment status

This integration branch is a review step only. It does not execute database cleanup, migration, or deployment. Review and test the pull request before merging it into `main`.
