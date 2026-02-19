# incremental-reading

An Obsidian plugin for incremental reading/writing with mobile-first support.

## Status

MVP baseline implemented.

## Implemented MVP Features

- Create queue
- Load queue
- Open current repetition
- Next repetition (simple scheduler rotation)
- Dismiss current repetition
- Add current note to queue
- Add current block to queue
- Add file to queue from file context menu
- Queue indicator (desktop status bar + status modal/panel)
- Persist cursor and scroll position per queue item

## Queue Storage

Queues are stored as markdown files in your vault under the configured queue folder.
Default path:

- `IncrementalReading/default.irqueue.md`

## Commands

- `Incremental Reading: Create queue`
- `Incremental Reading: Load queue`
- `Incremental Reading: Open current repetition`
- `Incremental Reading: Next repetition`
- `Incremental Reading: Dismiss current repetition`
- `Incremental Reading: Add current note to queue`
- `Incremental Reading: Add current block to queue`
- `Incremental Reading: Show queue status`

## Development

```bash
npm run check
npm run test
npm run build
```

Manual QA checklist: `docs/QA_CHECKLIST.md`

## License

MIT
