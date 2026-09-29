# 0004. Attachments on local disk behind a storage interface, served by signed URL
Date: 2026-09-29 · Status: Proposed · Deciders: Fero

## Context
SPEC §2 uses S3-compatible storage. SPEC §8 requires attachments to be served through expiring signed URLs.

## Options considered
| Option | Pros | Cons |
| --- | --- | --- |
| MinIO container | S3 API now | More infra |
| Local disk (`./storage`) behind `put/get` interface; HMAC-signed `/api/files/:id?exp&sig` | No infra; same URL contract | Not shared across instances |

## Decision
Local disk behind `storage.put/get`. URLs are signed with HMAC-SHA256 over `id + exp` and expire after 15 minutes.

## Consequences
- Follow-up: add an S3 implementation of the interface before production.
