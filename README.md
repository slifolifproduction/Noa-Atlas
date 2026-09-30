# Cognitive Atlas

A personal metacognition and life-strategy system. It maps what your life is made of, what happened in it, what seems to affect what, and which directions are open to you — and it can always show how it knows what it shows.

It is not a journal, a dashboard or a personality test. There are no scores, percentages, types or diagnoses. The system reads what you write, proposes, shows its evidence and counter-cases, and leaves conclusions and decisions to you.

Four layers are kept apart, plus one fenced mode:

| Layer | What it holds | Where you see it |
| --- | --- | --- |
| **Record** | What you wrote: notes and decisions. Never rewritten. | Time (notes, decisions) |
| **History** | What happened, when: events, actions, experiences, readings, decisions, tests; each traced to its note. | Time |
| **Map** | What exists: elements (values, beliefs, fears, goals, questions; behaviours, commitments, skills, roles; states, people, resources, places), each in an area of life, and the links you declare between them. | Map |
| **Understanding** | What is claimed about how things affect each other (claims, with evidence and a derived status), the loops they close, and what keeps happening (patterns). | Causes, Repeats, and the panel's questions |
| *Possibility* | Options not taken, imagined outcomes, paths not yet lived. Never evidence for anything. | Ahead, decisions' branches in Time |

```
record → read → map → notice → ask → explain → predict → test → compare → revise
```

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # domain + analysis tests
npm run build      # type-check and production build (static, works from any path)
```

The app opens on a fictional sample atlas (Noa, a freelance creative producer) so every screen has something to show. Settings lets you export, import, reload the sample, or start empty. Data lives in `localStorage` in your browser.

## Using it

You do not need to learn the whole system first. Everything starts from one gesture: **tap anything and ask about it.**

1. **Write what happens.** Press **Capture** (or `N`) and write a few lines. No title or fields needed: the first line becomes the title, and type, date, areas of life, tags and energy are under "More details". Switch to "A decision" to log a choice with its options and what you expected from each.
2. **Pick something to look at.** Tap anything on the map, or take the Overview's suggestion under **Something to look at**. It becomes the focus: "Looking at …" in the top bar, and the subject of every lens until you let it go (× or `Esc` twice).
3. **Ask.** The side panel tells a short story (what it is, what happened to it lately, one thing the Atlas noticed) and offers five questions: *What's been happening? · Why might this be happening? · What usually comes before or after? · Has this happened before? · What if I change it?* Each answer opens in place and goes one level deeper only when asked: a sentence, then **Why do you think that?**, then the moments behind it, then the note you wrote, with the passage marked.
4. **Add what you know, in words.** Under *Why might this be happening?* write another explanation ("Too many small favours", "holds it back"); naming something already on the map links to it, a new name is added with a first guess at its kind. The Atlas forms the relationship. Dragging from one thing to another still works, as an expert gesture.
5. **Try a change and see.** From *What if I change it?* pick a proposed test: change one thing on purpose, write what should happen, record what did. Then compare directions under **Ahead** and take the next step from **What you chose**.

## Finding your way

The top bar has five **lenses**, plus the focus chip, search, Capture and one "⋯" menu. A lens is a way of looking at the same atlas, and at whatever is in focus. Keys `1`–`5` switch lenses; on phones they sit in a bottom tab bar.

| Lens | What it answers |
| --- | --- |
| **Map** | *Where does it sit?* **Identity** at the centre; around it, seven areas of life as sectors (Projects, Work, Finance, Surroundings, People, Health & energy, Growth). The rings, from the centre outward, hold what you hold (values, beliefs, fears, goals, questions), what you do (behaviours, commitments, skills, roles) and what surrounds you (states, people, resources, places). At rest each area shows only its key elements (three at the centre, two per area: what you care about, what moved lately, what ties it to other areas); **+n** beside an area's name is what is folded inside, and choosing the area opens it. Every shown element keeps a line to its own area, a dashed line to any other area it connects to, and arcs join the areas themselves, so nothing floats alone. **View → Show every element** brings them all back. The possible reasons around what you are looking at appear on selection. |
| **Time** | *What happened, and when?* Notes, what they describe, decisions and tests on one line, newest first. Decisions are drawn as forks, with the branches not taken (dashed). Show everything, only notes, only decisions or only happenings; search what you wrote; filter to what is waiting for your yes or no. With a focus, only the moments about it. `J` and `D` open notes and decisions. |
| **Causes** | *What seems to affect what?* The same canvas and positions as the Map, now drawing the possible reasons, each by how sure it is. The side list holds the cycles the reasons close (feeding themselves, or holding themselves back) with their least sure step, and filters by how sure and by area. |
| **Repeats** | *What keeps happening?* Something like this has happened before: every time it happened and the exceptions, whether it is new, keeps happening or is fading, and "Does this ring true?". Repeats noticed in your decisions wait here for a yes or no. With a focus, only what involves it. |
| **Ahead** | *What could happen from here?* Your options side by side, described the same way and never ranked, drawn dashed because none of it has happened. **What you chose** sits on top (the goal, this week's step, the test running) and opens the full plan. With a focus, the options that count on it. |

Plain words first. How sure a reason is reads as *a hunch · seen a few times · keeps showing up · you tested it · exceptions outweigh it · no longer seems true*; where something came from is a quiet mark (*your words, you said so, seen in your notes, suggested, tested, imagined*). The underlying terms (claims, evidence kinds, contrast cases) appear only after "Why do you think that?", in **All of the reasoning**.

Things that keep it easy:

- **The Overview** on the Map holds two things: **Something to look at** (what you care about and what is moving, then where the map is quiet) and **Next step**, one concrete action worked out from your data.
- **Old links keep working.** `#/journal`, `#/decisions`, `#/questions` and `#/mind` open the matching lens.
- **One View menu per canvas.** Zoom and fit, showing every possible reason, only what is linked to the focus, hiding a ring, folding areas, the neighbourhood on Causes, reset layout and the lens's help all sit behind **View**.
- **Add** needs a name and an area. The kind of thing (which decides its ring) is guessed from the name and shown, so it can be changed in one tap.
- **The ⋯ menu** holds what you need now and then: **Versions**, the **Guide**, keyboard shortcuts and **Settings**.
  - **Versions**: save the whole atlas as a named version at any moment and go back to any version later; going back first saves what you have now. **Start fresh** begins an empty atlas (or the sample) and saves the current one first, with an Undo right after. Importing a file also saves a version first. Versions live in the browser's IndexedDB (the 30 most recent are kept, your own named ones first) and can be downloaded as JSON.
  - **The Guide** is the welcome: three statements and straight into the sample. It opens by itself on the first visit.
- **Language (EN / ID).** Every screen, message, help note and the text the local analysis writes is available in English and Bahasa Indonesia (lenses: Peta · Waktu · Sebab · Pengulangan · Ke depan). Switch with the **EN/ID** button in the top bar (on phones, in the ⋯ menu), in the welcome or under Settings → Language and time. The first visit follows the browser's language. What you write, and the sample atlas, are never translated; when Claude is the analysis provider it is asked to answer in the chosen language.
- **Live clock and time zone.** The clock in the top bar runs in real time in the chosen zone: this device, or Indonesia (Jakarta, WIB), Singapore, Japan (Tokyo), Australia (Sydney), the United Kingdom (London) or the United States (New York). Opening it shows all six side by side. The zone drives everything that depends on the date: what counts as today (and when it rolls over at midnight), the date a new note is filed under, week starts in the plan, experiment days, "3 days ago", the Overview date, version names and times.
- **How this page works** waits behind a small help link on every lens (on the canvases, in the View menu).

`N` captures anything, `⌘K` searches everything, `?` lists all shortcuts.

## Art direction

A deep-field instrument: star atlases, mission telemetry and editorial print rather than app chrome.

- **Colour.** Warm paper-white ink on near-black; hairlines do the separating instead of boxes. One signal colour, International Orange (the aerospace safety orange), marks only what is live, next or selected. Data keeps its own muted, print-like palette.
- **Type.** Two voices, chosen to read easily: Instrument Sans for titles and text (no italics, nothing condensed), IBM Plex Mono for labels, codes and measurements.
- **Geometry.** Square corners, registration marks on panels and dialogs, a viewfinder framing the map.
- **The map as a chart.** Angle is the area of life, distance from the centre is the layer. The person is a dial at the centre, each area a dial on the rim of its sector with its own hairline glyph; the rings are true circles, graduated, with a small tracer body, and each ring's name sits in the gap between sectors. Every element wears the mark of its kind (an anchor for a belief, a shield for a fear, a gauge for a state…) in its area's colour; a second ring marks an outcome you want explained.
- **Lines say what kind of knowledge they are.** Declared links are quiet dotted or dashed hairlines. Claims take their effect's colour and end (an arrow, or a bar for "limits"), and their status sets the stroke: dotted when proposed, dashed when plausible, solid when supported, heavier when tested, faint when weakened.
- **Numbers, quietly.** Dates and counts are set in a monospace; lens positions double as their keyboard keys.

## How it knows what it shows

Causes answers one question: *what may be contributing to this, based on the history and evidence in the atlas?* Not *what is connected to it*.

- **Being connected is not being a cause.** Five kinds of relation are kept apart:
  - *structural* ("part of", "is about"), *intentional* ("aims at", "a reason you give"), and *tension* ("in tension with", "aligns with") are **links**: true because you say so, needing no evidence, and never claiming that one changes the other;
  - *temporal* ("what came before or after") and *associational* (a pattern: "these keep happening in this order") come from history;
  - *causal hypotheses* are **claims**: "a change in A may contribute to a change in B";
  - *epistemic* relations are evidence, which supports or challenges a claim.
  Only claims are drawn in the Causes lens, only claims make things "near" there, and only claims your notes already show carry a moving pulse. Arcs between areas show possible reasons (arrowed) apart from links you drew (plain, undirected).
- **Claims are about factors.** A state or a behaviour already is one; for a whole thing (a project, a belief, a person, a goal) a claim names what about it changes ("Night Ferry, scope added late"), so the thing itself is never made the cause. Each claim says the part its cause plays (sets it off, adds to it, a background condition that makes it possible or limits it, keeps it going, holds it back), may hold *only when* something is true, may need another factor *together with* it, and has a typical delay.
- **Status is derived from the kinds of evidence, never typed in** (`src/domain/claims.ts`): *proposed* (a hunch) → *plausible* (in that order in two separate weeks, or one where the "how" was seen happening) → *supported* (three separate weeks and at least once without it) → *tested* (a deliberate change produced the predicted difference, worded as "raised … when you tested it"). Exceptions or a failed test *weaken* it; a claim can also *stop holding*. The wording follows the status ("may lower", "appears to lower"). There are no percentages and no shares anywhere.
- **What does not count, by design.** A written "how" is an explanation to check, not evidence that it happened. Coming before is a reason to look, not proof: an instance must be in that order and within the claim's delay, and sequences found in history wait for you to confirm them. The outcome happening *without* the cause is another route to the outcome (other contributors, chance, what is not on the map), never a case against the cause; only "the cause was there and the outcome did not follow" is an exception. Everything is counted per episode (week), for and against, so five notes about one week count once. Your own explanation in a note is a hypothesis, never evidence. Plans, expectations and imagined branches can never be evidence (the store refuses them).
- **Every claim traces back.** Claim → evidence (a time it happened, a time without it, an exception, the "how" seen, a test, another route) → the episode, drawn from two dated records when it comes from history (first this, then that, n days later) → the note or decision → your words, highlighted.
- **Explanations stay open** (`src/domain/explain.ts`). "Why might this be happening?" lists what may be contributing, by role; the explanations marked as competing; what happened to you from outside in the weeks before; and always *still unexplained*: the times it came up with nothing known to contribute first, the times it happened without one of these, and chance. It also says what would help tell explanations apart. A single happening can be explained the same way: which possible reasons were there in the weeks before it, which were not. Forward, "what if I change it?" and a decision's "what might follow" are marked as possibilities, apart from what actually followed.
- **The Causes lens starts from what you are looking at**: its possible reasons in the side list, and a trace back to what may lead to it, or on to what it may lead to, one or two steps along claims (not along a fixed ladder of behaviour, decision, belief).
- **Your view is kept apart.** Agree, unsure or disagree is recorded beside a claim's status and never changes it; the same holds for your assessment of a pattern.
- **Patterns describe; claims explain, on the same atlas.** A pattern is a regularity in history ("A, then B, then C"), with its episodes and exceptions. Why each step follows the last is a claim between the same elements, the one Causes shows; a claim's weeks that also make up a repeat are shown as the same episodes, never as a second confirmation.
- **Cycles are found, not drawn** (`src/domain/loops.ts`): when claims your notes show at least a few times close a circle, the Atlas shows it as feeding itself or holding itself back, only as sure as its least sure step. A circle of hunches is not a cycle.
- **The analysis only proposes.** Every proposal shows the phrase or record that triggered it; elements and claims it proposes stay off the map until you adopt them; inner states are only ever yours to declare.
- **Every change is logged.** Evidence added or removed, adopted claims, status changes from tests, your views, set-aside patterns and chosen directions go into an append-only model log.

## Architecture

```
src/
  domain/        types (the data model), constants, claims (evidence profile and status), loops, history, pure selectors, ask (the answers to the panel's five questions)
  data/          seed dataset and the empty atlas
  ai/            analysis provider contract, local heuristics, Claude provider, Zod output schemas
  persistence/   storage adapter (localStorage with in-memory fallback), versioning, import/export, migration from the first data shape
  state/         Zustand stores: atlasStore (data + mutations), uiStore (selection, layout, filters), operations (AI + store workflows)
  graph/         the layout (by area × layer), one graph builder with two lenses (Map, Causes), motion and 3D space engine
  components/    graph canvas and nodes, inspector panel, capture form, command palette, UI primitives
  pages/         one folder per section
  i18n/          t()/tn() and the Indonesian dictionary (English text is the key; loaded only when needed)
  lib/dates.ts   the clock: chosen time zone, today, calendar arithmetic, date and time formatting
server/
  claude-proxy.ts   optional Node proxy for the Claude API
```

- **Data model** (`src/domain/types.ts`): record (`Entry`, `Decision` with its options, expectations and imagined branches), history (`Occurrence`, with a mode: actual, expected, planned or possible), map (`AtlasNode` elements of a kind in an area with a lifespan, `AtlasEdge` declared links, `Area`), understanding (`Claim` with typed `Evidence`, rivals and your view; `Pattern` with steps, instances and the claims that explain it; investigations on questions), plans and possibility (`StrategicPath` with the claims it relies on, `Experiment` with prediction and criteria, `NavigationPlan`), and the `ModelUpdate` log. Collections are normalised records keyed by id, so a backend can replace the store without reshaping the UI.
- **One element, shown everywhere.** An element sits at one position on the canvas whichever lens is on (Map or Causes), appears in Time, Repeats and Ahead through what concerns it, and in search and the panel, always as the same record. The focus (`uiStore.focus`) is what every lens filters by; it lives for the session only.
- **Older atlases are migrated** (`src/persistence/migrate.ts`): domains become areas, nodes become elements of a kind, edges that claimed an effect become claims with no evidence, organising edges become links, experience mirrors become landmark occurrences, and numeric confidence is dropped. An atlas that is still the sample is rebuilt from the new sample and keeps what you added.
- **Graph state is preserved.** Dragged positions, viewports and filters persist per graph.
- **Interface text** is written in English and passed through `t()` / `tn()` (`src/i18n`). `src/i18n/id.ts` holds the Indonesian; its unit test parses the code and fails when any interface text lacks a translation, placeholders differ, or an entry is no longer used. Content (notes, the sample atlas) is never translated.
- **Time** has one source (`src/lib/dates.ts`): "now" is read in the chosen zone, calendar dates are stored as plain `YYYY-MM-DD` and computed on UTC noon so no zone or daylight saving shifts a day, and moments (timestamps) are shown in the chosen zone. A shared one-second ticker drives the clocks; `useToday()` re-renders views only when the date changes.
- **One atlas, always whole** (`src/domain/integrity.ts`). Every change goes through a store action, and every action ends with `repairReferences` in the same step. What cannot stand without what it points at goes with it: deleting an element removes its links and the claims about it (so it leaves the Map and Causes together, and its cycles close no more); deleting a note or decision removes the happenings read from it and the evidence it gave. What can stand on its own is only unlinked: notes, decisions, happenings, pattern steps, tests and questions that mentioned the element; options, tests, patterns and decisions that relied on a deleted claim; suggestions that can no longer be answered; cycle names; a plan whose direction was deleted. Links kept on both sides (options ↔ tests) are kept in step, and renaming an element renames the pattern steps that stand for it. Words stay words: a note, a pattern's description or an option's text that mentions something in its own words is history and is never rewritten. Imported files, restored versions and atlases saved by earlier versions are repaired on the way in. The interface follows (`src/state/follow.ts`): the panel's trail, the focus every lens answers about, the highlighted cycle, an open edit form and saved map positions let go of anything that is gone. `integrity.test.ts` deletes every element, claim, note, decision, happening, test, option and link of the sample one by one and checks that nothing points at nothing and that the Map and Causes draw only what exists; the log records any status change.
- **The graphs are a 3D space** (`src/graph/space.ts`). Every node has a depth: each ring is its own plane, with the person and their core nearest, what they hold, what they do and what surrounds them farther back, and the area markers on the rim behind everything (with the viewfinder frame as the nearest glass), and the star field always behind; a perspective camera turns with the pointer, device tilt or a slow idle sway, and panning and zooming move near and far nodes at different rates. The engine writes node, edge, ring and overlay transforms straight to the DOM each frame, so nothing re-renders React; depths are compensated so the stored layout is exactly what you see at rest. Selecting a node brings it and its neighbourhood forward (nodes scale about their own centre, so edges and the selection reticle stay exactly on them), the pointer gently pulls on nearby nodes, pans carry momentum, and arrow keys travel along connections. The network also behaves like a running system: nodes drift idly and each ring's elements turn slowly back and forth together around the centre, inner rings a little faster, while the orbit rings' dashes flow; behind it all, space stays quiet so the graph is the subject: a sparse field of small stars drifts slowly toward you and a few twinkle, two faint hazes and a vignette give depth, and it answers you through parallax (pans, zooms and the camera's turn); nodes are springs coupled along their links, so a disturbance travels to neighbours and fades; every few seconds a signal leaves one node and propagates up to three links outward, jolting and briefly firing each node it reaches (an illustration, not a finding); signals start more often from nodes you have been attending to; selecting a node reorganises its neighbourhood around it; and on load, nodes arrive from deep space in reveal order. Settings → Space switches between automatic (steps down to flat on devices that cannot keep it smooth), always 3D, and flat; reduced-motion preferences always keep it still.

### The analysis layer and Claude

`src/ai/types.ts` defines `AnalysisProvider`: `analyzeEntry`, `detectDecisionPatterns`, `proposeExperiments`, `evaluateExperiment`, `draftNavigationPlan`. Every method returns structured objects the UI renders directly.

- `localProvider` — deterministic, transparent heuristics (default, offline).
- `createClaudeProvider` — posts compact context to `server/claude-proxy.ts`, which calls the Messages API with the task's Zod schema as the structured output format (`src/ai/schemas.ts`, shared by browser and server). Responses are validated again in the browser, and any id the model returns that does not exist in the atlas is dropped. If the proxy is unreachable, calls fall back to local heuristics with a notice.

To use Claude:

```bash
ANTHROPIC_API_KEY=... npm run proxy   # http://localhost:8787/api/analysis
npm run dev                           # Vite forwards /api/analysis to the proxy
```

Then choose **Claude, via your proxy** in Settings. The API key stays on the server. The proxy defaults to `claude-opus-5` (override with `ATLAS_MODEL`).

## Responsive behaviour

Desktop is the primary experience. On tablets the inspector becomes a bottom sheet and the Overview opens on demand. On phones the canvas switches to a compact portrait layout showing you and the area markers (an area's elements appear when it is selected), the Overview and the Causes list open in a sheet, the five lenses move to a bottom tab bar, and the panel opens as a sheet above it so the lenses stay reachable. The information architecture stays the same.
