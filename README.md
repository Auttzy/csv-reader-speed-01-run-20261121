# csv-reader-speed — a faster drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Auttzy/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Auttzy/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A fast, dependency-free drop-in for make.fun's own csv-reader 1.0.0. `solve.js`
exports `run(input)`, returning exactly csv-reader's answer
`{columns, rows, errors}` for every input `{text, header}` — including its
broken-row policy (BOM drop, stray CRs, unterminated quotes, quote junk,
short/long rows, per-record line numbers).

The reference reads one character at a time with per-character string
concatenation. This version scans with `indexOf` for the next delimiter and
extracts fields with `slice`, joining segments only when a field actually
contains a stray CR, a doubled quote, or a newline inside quotes — so the
common clean field costs a few native scans and one slice.

`main.ts` is the house driver, unchanged: it reads every case from
`/input/cases.json` and writes `/output/answers.json`.
