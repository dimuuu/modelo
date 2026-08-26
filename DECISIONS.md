# Decisions

## Needs Dmytro

- **Public name and copy:** keep “Modelo” and the restrained one-line positioning, or tune the name/voice before challenge submission?
- **Persistence expectation:** v1 is deliberately browser-local. Decide whether a later version needs account sync/sharing, which would change the no-backend architecture.
- **Units UX:** v1 accepts a display unit and leaves explicit conversions to MathJS formula expressions. Decide whether the editor should grow dedicated unit pickers/conversion controls.
- **Import policy:** workspace import currently replaces the local workspace after validation. Decide whether import should merge instead.
- **WebMCP test surface:** document tools disappear on the workspace home by design; workspace tools remain. Confirm this is the desired judging/demo flow.
- **Production domain:** use Vercel's `modelo.vercel.app` alias or attach a custom domain.

## Assumptions made for v1

- Variable names are MathJS-safe identifiers (`letters/_`, then `letters/digits/_`) and case-sensitive.
- Currency is formatting only; there is no live FX. Seed models use EUR.
- Select option values are numeric; labels carry scenario meaning.
- Deleting the final block is refused by BlockNote; deleting variables otherwise leaves formula errors and `missing` inline chips visible.
- Multi-tab live synchronization, auth, sharing, locks, dark mode, AI chat, and a backend are intentionally out of scope.
- A Vitest + happy-dom persistence smoke test is sufficient for v1; Playwright was not added to avoid downloading and shipping a browser dependency for two storage assertions.
