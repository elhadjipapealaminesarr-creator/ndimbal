# NDIMBAL — fairness log (simulated data only)

This file is appended automatically by the [`fairness.yml`](./.github/workflows/fairness.yml)
GitHub Action. Each row is one run of the fairness harness
([`test/verify-draw.test.js`](./test/verify-draw.test.js)) over **200 simulated draws**, confirming
that (1) every round has **exactly one winner** and (2) a bigger deposit wins **more often** — while
no balance, pool total or ticket is ever revealed.

> **Guard-rail:** these results come exclusively from **synthetic test accounts** on the fhEVM mock.
> The workflow never reads or publishes any real depositor's balance, ticket, or the real pool total.
> It proves the *mechanism* is fair by re-playing it on simulated data — never by touching production data.

| Timestamp (UTC) | Rounds | Outcome | Result | Run |
|---|---|---|---|---|
| _first automated run will appear here_ | 200 | — | seeded on first schedule/dispatch | — |
| 2026-08-04T14:02:25Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/30916755267) |
| 2026-08-05T02:06:52Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/30968356222) |
| 2026-08-05T13:59:48Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31012852394) |
| 2026-08-06T02:10:30Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31064808556) |
| 2026-08-06T13:57:43Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31108353821) |
