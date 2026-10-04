# Enquiry sources and admin actions

Apply `migrations/0004_enquiry_lead.sql` before using this version. It adds only
the nullable `lead` column; historical records remain NULL. This migration was
applied to production on 2026-10-04 (Asia/Calcutta).

## Public source selection

The first form field requires Career Fix Tamizha (`CFT`) or WEBEYOND directly
(`direct`). No option is preselected. The API accepts only these exact values;
missing or invalid sources return 400 before any insert. No link, cookie or
browser storage determines attribution. The existing `lead` column is reused
and historical rows are preserved. No signing secret is required.

## Authenticated routes

- GET `/api/admin/enquiries`: existing rows, including Lead, newest first.
- POST `/api/admin/enquiries`: name/phone required; business_name/email/message/
  lead optional. Lead allows free text up to 100 characters and defaults to
  `manual`. D1 generates id and created_at. Returns the created row with 201.
- DELETE `/api/admin/enquiries/:id`: positive safe-integer ID; 400 for malformed
  IDs, 404 for absent rows. Returns the deleted ID.

Create and delete require the existing valid admin session and exact same-origin
Origin header. Create additionally requires JSON. Prepared D1 statements are
used throughout. Deletion is permanent; the UI asks for ID/name confirmation
and there is no bulk deletion, edit or undo feature.

The UI adds a Lead sort column, a compact native Add enquiry dialog, and one
Delete button per row. Table sorting, expansion and mobile horizontal scrolling
are preserved. API errors retain the existing table and display a message.
