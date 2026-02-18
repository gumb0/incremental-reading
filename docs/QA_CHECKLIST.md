# MVP QA Checklist

## Desktop

- [ ] Plugin enables without errors.
- [ ] Create queue command works.
- [ ] Load queue command switches active queue.
- [ ] Add current note command adds note once (duplicate blocked).
- [ ] Add current block command creates/uses block reference.
- [ ] Open current repetition opens expected note/block.
- [ ] Next repetition rotates to next queue item.
- [ ] Dismiss current repetition removes item.
- [ ] Status bar updates queue name, count, and current item.

## Mobile

- [ ] Plugin enables without errors.
- [ ] Commands are available from command palette.
- [ ] Add note/block commands work in mobile editor.
- [ ] Open current / Next / Dismiss flows work end-to-end.
- [ ] Queue status modal shows active queue state.
- [ ] Reading position restores for note/block when reopened.

## Data Integrity

- [ ] Queue JSON remains valid after repeated next/dismiss actions.
- [ ] Invalid schema/version queue file is rejected with notice.
- [ ] Missing queue files are handled with notice.
