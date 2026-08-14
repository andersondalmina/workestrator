---
description: Run every check CI runs, and fix what fails
---

Run `make check`. It runs format-check, lint, typecheck and the test suite — the same four things
CI runs on a pull request.

If anything fails, fix the cause rather than the symptom. Do not skip a test, loosen `tsconfig`,
add an `eslint-disable`, or cast to `any` to get past it; if that looks like the only way through,
stop and say what is blocking you.

Re-run until it is clean, then report what you changed.
