# Compatible service protocol

AI Bridge sends HTTPS requests to the endpoint entered by the user. Every request includes `Authorization: Bearer <write token>`.

## Health check

`GET /health`

Any `2xx` response is treated as successful.

## Notes

`PUT /note` with JSON:

```json
{
  "path": "Daily/2026-08-29.md",
  "content": "Markdown text",
  "mtime": 1787961600000
}
```

`DELETE /note?path=<vault-relative-path>` removes a note. A `404` response is accepted as already removed.

## Attachments

`PUT /asset?path=<attachment-path>&note=<note-path>` sends the raw file bytes. The request includes the attachment MIME type as `Content-Type` and its modification time as `X-Mirror-Mtime`.

`DELETE /asset?path=<vault-relative-path>` removes an attachment. A `404` response is accepted as already removed.

The service must validate tokens, paths, MIME types, and size limits independently. Never trust a client-side filter as the only security boundary.
