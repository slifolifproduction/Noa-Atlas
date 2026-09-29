# Cognitive Atlas

A personal metacognition and life-strategy system. It maps how you think, which patterns recur in what you do, and which strategic paths are open to you — and it keeps every claim tied to the evidence behind it.

It is not a journal, a dashboard or a personality test. There are no scores, types or diagnoses. The system observes, shows its evidence and counter-evidence, offers interpretations as possibilities, and leaves decisions to you.

```
user data → observations → evidence → interpretation → patterns → metacognitive map
          → strategic options → experiments → real-world results → updated model
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

You do not need to learn the whole system first. The app runs on one loop:

1. **Write what happens.** Press **Capture** (or `N`) and write a few lines. No title or fields needed: the first line becomes the title, and type, date, areas of life, tags and mood are under "More details" if you want them. Switch to "A decision" to log a choice with its options.
2. **See what repeats.** The analysis suggests links and pattern evidence, always with the passage behind it. Accept what fits, reject what does not.
3. **Choose a direction** under Plan → Options, where your choices are compared side by side and never ranked.
4. **Take the next step** from Plan → My plan.

## Finding your way

The top bar has four places, plus search, Capture and one "⋯" menu. Pages that belong together share a place and switch with tabs just under the bar. Keys `1`–`4` open a place; pressing the same key again moves to its next tab.

| Place | Tabs | What it answers |
| --- | --- | --- |
| **Map** | Orbit · Mind | *Where am I?* Ten life domains as a spatial graph (self → intent → work → conditions); hub arcs show where recent writing went, badges show active patterns. *How am I thinking?* Beliefs, assumptions, motivations, fears, values, mental models, decisions, questions and experiences, linked by typed relationships, with detected patterns in the middle. |
| **Notes** | Journal · Decisions · Questions | *What happened, what did I decide, what am I still asking?* Every note, each decision with what you expected and what actually happened, and the questions you are keeping open. `J`, `D` and `Q` jump straight to each. |
| **Patterns** | | *What keeps happening?* Each pattern: trigger → behaviour → consequence, frequency, derived confidence, an evidence timeline with the exact passages, interpretations, counter-evidence, implications, experiments, your own assessment and the model history. |
| **Plan** | My plan · Options | *What do I do next?* The route for the direction you chose: position → 12-month goal → experiment → milestone → 30-day targets → this week → next step, with experiments alongside. *What are my options?* Scenarios branching from where you are, compared on the same attributes; listed alphabetically, never ranked. |

Things that keep it easy:

- **Do this next**, at the top of the Overview on the Map (Orbit), always shows one concrete action (write your first note, review suggestions, record a finished experiment's result, mark this week's step done…), worked out from your data. The Overview holds only four things: do this next, where you are, your plan (goal, next step, running experiment) and your top patterns.
- **One View menu per graph.** Zoom and fit, focus on the selection, folding areas, the Overview panel, the neighbourhood around a selected Mind card, reset layout and the page's help all sit behind the **View** button. The Mind's side list shows kinds of cards; kinds of link and the rest are under "More filters".
- **Add point** on Orbit and Mind adds your own goals, projects, people, beliefs, questions… directly to the map.
- **The ⋯ menu** holds what you need now and then: **Versions**, the **Guide**, keyboard shortcuts and **Settings**.
  - **Versions**: save the whole atlas as a named version at any moment and go back to any version later; going back first saves what you have now. **Start fresh** begins an empty atlas (or the sample) and saves the current one first, with an Undo right after. Importing a file also saves a version first. Versions live in the browser's IndexedDB (the 30 most recent are kept, your own named ones first) and can be downloaded as JSON.
  - **The Guide** is a short introduction that opens by itself on the first visit.
- **How this page works**: every page has a short note, open on the first visit and one click away afterwards (on the graphs, in the View menu).

`N` captures anything, `⌘K` searches everything, `?` lists all shortcuts.

## Evidence-first reasoning

- **Confidence is derived, never typed in.** `(supporting + 2) ÷ (all evidence + 4)`: it starts at 50% and moves only as evidence accumulates. Completed experiments count double because they were designed to test the claim. See `src/domain/confidence.ts`.
- **Interpretations are separate from confidence.** They carry a model estimate, shown differently, and are always phrased as possibilities.
- **Nothing becomes evidence automatically.** The analysis layer proposes (with the phrases or metadata that triggered each proposal); you accept or dismiss.
- **Counter-evidence is first-class.** A pattern with none says so and suggests a counter-evidence experiment.
- **Every change is logged.** Evidence added or removed, experiment results, your assessments and chosen directions go into an append-only model log shown per pattern.

## Architecture

```
src/
  domain/        types (the data model), constants, confidence math, pure selectors
  data/          seed dataset and the empty atlas
  ai/            analysis provider contract, local heuristics, Claude provider, Zod output schemas
  persistence/   storage adapter (localStorage with in-memory fallback), versioning, import/export
  state/         Zustand stores: atlasStore (data + mutations), uiStore (selection, layout, filters), operations (AI + store workflows)
  graph/         layouts (radial Orbit, force-directed Mind), graph builders, selection logic, motion and 3D space engine
  components/    graph canvas and nodes, inspector panel, capture form, command palette, UI primitives
  pages/         one folder per section
server/
  claude-proxy.ts   optional Node proxy for the Claude API
```

- **Data model** (`src/domain/types.ts`): `Entry`, `Decision`, `Observation`, `Evidence`, `Interpretation`, `CounterEvidence`, `StrategicImplication`, `Pattern`, `AtlasNode`, `AtlasEdge`, `StrategicPath` (scenario), `Experiment`, `NavigationPlan`, `ModelUpdate`. Collections are normalised records keyed by id, so a backend can replace the store without reshaping the UI.
- **One node, two maps.** A node with a `domain` appears in Orbit; with a `category`, in Mind. A value like *Autonomy* is one record in both.
- **Graph state is preserved.** Dragged positions, viewports and filters persist per graph.
- **All mutations go through store actions**, which keep referential integrity (deleting an entry removes it from pattern evidence and logs the confidence change).
- **The graphs are a 3D space** (`src/graph/space.ts`). Every node has a depth (Orbit: by ring, with satellites drifting through their hub's depth over time); a perspective camera turns with the pointer, device tilt or a slow idle sway, and panning and zooming move near and far nodes at different rates. The engine writes node, edge, ring and overlay transforms straight to the DOM each frame, so nothing re-renders React; depths are compensated so the stored layout is exactly what you see at rest. Selecting a node brings it and its neighbourhood forward (nodes scale about their own centre, so edges and the selection reticle stay exactly on them), the pointer gently pulls on nearby nodes, pans carry momentum, and arrow keys travel along connections. The network also behaves like a running system: nodes drift idly and each hub's satellites turn slowly back and forth around it like a small planetary system, while the orbit rings' dashes flow; behind it all, space stays quiet so the graph is the subject: a sparse field of small stars drifts slowly toward you and a few twinkle, two faint hazes and a vignette give depth, and it answers you (pans, zooms and the camera's turn add parallax, and a soft light follows the pointer, lifting and gently parting the stars around it); nodes are springs coupled along their links, so a disturbance travels to neighbours and fades; every few seconds a signal leaves one node and propagates up to three links outward, jolting and briefly firing each node it reaches (a live readout names the path); signals start more often from nodes you have been attending to; selecting a node reorganises its neighbourhood around it; and on load, nodes arrive from deep space in reveal order. Settings → Space switches between automatic (steps down to flat on devices that cannot keep it smooth), always 3D, and flat; reduced-motion preferences always keep it still.

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

Desktop is the primary experience. On tablets the inspector becomes a bottom sheet and the Overview opens on demand. On phones the Orbit graph switches to a compact portrait layout showing domains only (satellites appear when a domain is selected), the Mind graph opens at a readable zoom with filters in a sheet, and the four places move to a bottom tab bar. The information architecture stays the same.
