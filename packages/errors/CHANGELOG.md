# @braedonsaunders/appkit-errors

## 0.2.0

### Minor Changes

- 213b8e8: Introduce `@braedonsaunders/appkit-errors`: one vocabulary and one path for refused actions. A typed `ErrorKind` taxonomy classified from the response status, a `readActionResult`/`fetchAction` read path that cannot throw, an `executeAction` lifecycle that always releases busy state, a `useAction` hook that pins the refusal until the next action, and an `ActionAlert` built on the house `Alert` so refusals persist as `role="alert"` instead of vanishing with a toast. The package authors no user-facing copy; hosts supply all fallbacks and notifications.
