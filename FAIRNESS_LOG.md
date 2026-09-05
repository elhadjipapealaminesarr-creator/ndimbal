# NDIMBAL — fairness log (simulated data only)

This file is appended automatically by the [`fairness.yml`](./.github/workflows/fairness.yml)
GitHub Action. Each row is one run of the fairness harness
([`test/verify-draw.test.js`](./test/verify-draw.test.js)) over **200 simulated draws**, confirming
that (1) every round has **exactly three winners** (the top-3) and (2) a bigger deposit lands in the
top-3 **more often** — while no balance, pool total or ticket is ever revealed.

> Rows dated before 2026-08-10 recorded the earlier **single-winner** draw; from the top-3 upgrade on,
> the harness (and each new row) verifies **exactly three winners** per round.

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
| 2026-08-07T02:29:00Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31141296978) |
| 2026-08-07T12:54:50Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31180166384) |
| 2026-08-08T01:16:25Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31232214887) |
| 2026-08-08T12:39:17Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31257696125) |
| 2026-08-09T01:21:35Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31288079563) |
| 2026-08-09T12:41:19Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31313873361) |
| 2026-08-10T01:23:10Z | 200 | success | PASS — exactly one winner every round; bigger deposit won more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31346903057) |
| 2026-08-10T12:58:43Z | 200 | failure | FAIL — see run log | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31390511501) |
| 2026-08-11T01:20:43Z | 200 | failure | FAIL — see run log | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31448981581) |
| 2026-08-11T08:06:32Z | 40 | failure | FAIL — see run log | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31471710325) |
| 2026-08-11T08:26:40Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31473152864) |
| 2026-08-11T12:55:18Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31493471839) |
| 2026-08-12T01:30:02Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31553737051) |
| 2026-08-12T13:00:18Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31599139397) |
| 2026-08-13T01:39:55Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31658363130) |
| 2026-08-13T13:01:16Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31702747887) |
| 2026-08-14T01:38:47Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31761204656) |
| 2026-08-14T12:57:35Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31802492982) |
| 2026-08-15T00:59:59Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31855226906) |
| 2026-08-15T12:29:29Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31884693845) |
| 2026-08-16T01:03:25Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31918655297) |
| 2026-08-16T12:31:26Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31947253487) |
| 2026-08-17T01:01:31Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/31983668825) |
| 2026-08-17T12:35:48Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32030556662) |
| 2026-08-18T00:59:24Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32086515193) |
| 2026-08-18T12:37:24Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32137727494) |
| 2026-08-19T01:00:23Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32203301026) |
| 2026-08-19T12:38:44Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32253639527) |
| 2026-08-20T01:00:06Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32319340786) |
| 2026-08-20T12:39:36Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32369914903) |
| 2026-08-21T01:03:47Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32434900579) |
| 2026-08-21T12:38:44Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32482793945) |
| 2026-08-22T01:00:16Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32542067013) |
| 2026-08-22T12:31:14Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32573167283) |
| 2026-08-23T01:05:10Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32609454389) |
| 2026-08-23T12:31:58Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32639619063) |
| 2026-08-24T01:02:33Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32678476176) |
| 2026-08-24T12:41:04Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32728313762) |
| 2026-08-25T01:02:04Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32795907078) |
| 2026-08-25T12:39:56Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32848759279) |
| 2026-08-26T01:03:39Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32917465606) |
| 2026-08-26T12:43:14Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/32970002384) |
| 2026-08-27T07:01:27Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33047981227) |
| 2026-08-27T21:40:47Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33119178407) |
| 2026-08-28T08:49:21Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33156803303) |
| 2026-08-28T21:41:43Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33213600239) |
| 2026-08-29T05:25:53Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33236111418) |
| 2026-08-29T16:08:28Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33262106491) |
| 2026-08-30T03:21:58Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33290057565) |
| 2026-08-30T15:57:53Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33321061255) |
| 2026-08-31T03:18:21Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33353368756) |
| 2026-08-31T18:41:45Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33426352964) |
| 2026-09-01T03:20:54Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33465817023) |
| 2026-09-01T16:00:18Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33529093935) |
| 2026-09-02T02:38:52Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33583930977) |
| 2026-09-02T15:53:54Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33651418446) |
| 2026-09-03T02:45:03Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33708741824) |
| 2026-09-03T15:43:18Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33774184453) |
| 2026-09-04T02:49:07Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33830446631) |
| 2026-09-04T15:41:41Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33890857320) |
| 2026-09-05T02:43:50Z | 40 | success | PASS — exactly three winners (top-3) every round; bigger deposit lands in the top-3 more | [run](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/runs/33939856651) |
