# Occono Workflow Kanban v1

This folder contains the first non-production workflow interface for Occono.

## Current state

- Static browser application suitable for GitHub Pages preview.
- Owner view across Enquiries, Outreach, and Build & Delivery.
- Staff-role filtering is implemented in the client prototype for demonstration.
- Owner-only drag and drop is implemented locally.
- Data currently uses representative records mapped from the TEST enquiry workbook.
- No live workbook writes are enabled.

## Security boundary

Client-side filtering is not the production security control. Production must use a protected API that derives the signed-in identity from Cloudflare Access and applies the following server-side rules:

- `owner`: may read and update all workflows and assignments.
- `manager`: may read and update records in explicitly permitted teams/workflows.
- `staff`: may read records where their permanent user ID is the assignee, owner, or authorised collaborator.

The API must never accept a role or user ID supplied by the browser as authoritative.

## Proposed API

- `GET /api/session`
- `GET /api/workflows?workflow=enquiries&owner=usr-darren`
- `GET /api/workflows/:recordId`
- `PATCH /api/workflows/:recordId/status`
- `PATCH /api/workflows/:recordId/assignment`
- `POST /api/workflows/:recordId/activity`

Every mutation must create an immutable activity entry containing actor ID, timestamp, old value, new value, and request correlation ID.

## Workbook mapping

Initial TEST workbook: `Occono Enquiry System — TEST`

| Kanban field | Enquiries column |
| --- | --- |
| `recordId` | Enquiry ID |
| `createdAt` | Created Timestamp |
| `title` | Business, falling back to Name |
| `contactName` | Name |
| `status` | Status |
| `ownerDisplayName` | Owner |
| `nextAction` | Next Action |
| `nextActionDue` | Next Action Due |
| `summary` | Original Message |
| `folderUrl` | Drive Folder URL |
| `threadId` | Gmail Thread ID |

A permanent `Assigned User ID` column is still required before multi-user production use. Display names must not be used as security identifiers.

## Deployment target

- Source: GitHub repository
- Public website: existing GitHub Pages deployment
- Staff application target: `workflow.occono.co.uk`
- Authentication target: Cloudflare Access
- Backend target: Cloudflare Worker or Pages Function calling a controlled Google Apps Script service
