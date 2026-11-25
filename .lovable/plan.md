# Project Flow Documentation App

## Goal
Build the Indonesian, single-user documentation app described in the provided PRD. Open directly to the project dashboard with no login, cloud account, or network dependency.

## MVP scope
- Dashboard: project cards, search/filter/sort, create and edit project details, and clear empty states.
- Project workspace: process-flow notes, image attachments, feature outline, expandable feature sections, and editable feature notes.
- Customer points: quick add, edit, reorder, duplicate, move, optional date/source/speaker, and image attachments.
- Global search: `/` shortcut; case-insensitive, prefix-aware AND matching across project/feature/point/flow text; filters and result navigation to the matching point.
- Safe deletion: undo, trash listing, restore, and confirmed permanent deletion for projects, features, points, and images.
- Data portability: downloadable backup archive with restore, project Markdown/PDF export, JSON export, storage usage, and backup status.
- Apply a UIARC-inspired component style with crisp hierarchy, responsive navigation, accessible controls, keyboard focus, and restrained motion.

## Data and runtime
Use browser IndexedDB for structured records and image blobs so the app works without a login, backend, or network. This keeps data on the current browser profile/device; it is not a SQLite file beside the app. Backups and exports will be user-triggered downloads, and restore will use a selected archive. Defer all browser API access until after hydration or inside event handlers.

## Out of scope
Point revision history/status, tags, team features, cloud sync, AI, external integrations, and a packaged desktop installer remain out of scope as in the PRD.

## Validation
Verify project creation and persistence, feature/point capture, attachment handling, search and result navigation, trash restoration, and export/restore. Run the existing tests and check the live preview at desktop and mobile widths.