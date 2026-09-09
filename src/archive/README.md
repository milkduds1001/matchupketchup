# Archive

Components moved here are superseded, not deleted — fully working code, just disconnected from
the active build/nav so there's less to review while other parts of the app (Sideboard Builder)
are under active refactor. Nothing outside this folder imports these files. To resurface one,
`git mv` it back under `src/components/`, re-add its import/route in `App.jsx`, and check its
`git log` for the commit that archived it (context on why, and what replaced it).

- **MatchupCardBoard.jsx / CardPile.jsx** (+ their `.css`) — the old on-screen Step 4 matchup
  editor (mana-value columns of quantity-badged card "piles", drag to move in/out). Superseded by
  `PlanBuilderPage.jsx` ("Sideboard Builder"), which edits the same underlying `matchupValues`
  data with a richer per-copy card UI. `MatchupTable.jsx` (still active) is unrelated — it's the
  print-only render of the same matrix and isn't affected by this move.
- **MatchupSummary.jsx** (+ `.css`) — was never wired into `App.jsx`; archived as dead code rather
  than left sitting unused in `src/components/`.
