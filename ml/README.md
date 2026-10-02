# The local AI: data, models and how they were measured

Everything the app's local AI learned from, and how to make it again. The app code is in `src/ml`. The scores below come from `ml/report.md`, which `npm run ml:train` writes.

## What it reads

Each sentence of a note is read for five questions ("heads", `src/ml/tasks.ts`). Each head has a fixed set of answers.

| Head | Answers | What it means |
|---|---|---|
| act | none, happened, done, decided, planned | What the sentence reports doing. |
| direction | none, up, down | Whether something went up or down. |
| cause | no, yes | Whether it explains why ("because…", "karena…", "gara-gara…"). "Once…" and "setelah…" are not a cause. |
| time | past, now, future | When it is about. |
| mood | neutral, low, high | How the person says they feel. Only a feeling stated in words counts: nothing is inferred from events. |

## The data

| Set | Sentences | How it was made | Used for |
|---|---|---|---|
| `data/train.jsonl` | 9000 (id 4671, en 4329) | Generated from 150 clause templates and slots | Training. Every 10th sentence is kept for early stopping. |
| `data/test.jsonl` | 1872 (en 1002, id 870) | Generated from 34 templates that are never used in training | Testing on sentence shapes the model has not seen. |
| `data/gold.jsonl` | 140 (id 67, en 63, mixed 10) | Written by hand, apart from any template, formal and chat-style | The test to trust. |
| `public/ml/sample.json` | 2400 | A packed sample of the training set | Training the heads on the device (see below). |

### How the generated data is made

`data/generate.ts` builds the generated sets. It is deterministic: the same seed gives the same data.

- **Clauses and slots.** Sentences are made from clauses (done, decided, planned, happened, feelings, ups and downs, plain statements) and slots (tasks, people, places, things that go up or down, choices, bills, routines).
- **Shapes.** About 60% are a single clause. About 20% join a cause and an effect ("because", "so", "karena", "jadi"). About 7% state a purpose ("so that", "biar"). The rest join two clauses with "and" / "terus".
- **Labels.** They follow from how each sentence was built, so they are exact for what the templates say.
- **How people type.** Informal spellings ("udah", "gak", "bgt"), dropped subjects and lower case are added.

### Labels in the generated data

| Head | Counts |
|---|---|
| act | done 2399, happened 1873, decided 1660, none 1644, planned 1424 |
| direction | none 7790, up 613, down 597 |
| cause | no 5285, yes 3715 |
| time | past 6362, future 1566, now 1072 |
| mood | neutral 7387, low 878, high 735 |

Rare answers get class weights in training, so they are not drowned by the common ones.

### Limits

- The generated sentences share slots and connecting words, so the test set is easier than real notes. That is why the gold set exists.
- The gold set is small: 140 sentences, 16 low and 15 high moods. Its scores move by several points with a handful of sentences.
- Its mistakes were read once, after the first run, to find kinds of sentence the data lacked. Templates of those kinds were added; the gold sentences themselves never were. Its labels were made consistent with the definitions above, and it has not been tuned on since.

## The models

### Built-in model (`public/ml/lite.json`, about 800 KB)

`train.ts` trains two models on the same features: hashed word unigrams and bigrams, and letter 3–5-grams, in 8192 buckets (`src/ml/features.ts`).

- **Machine learning (ML).** Multinomial logistic regression.
- **Deep learning (DL).** A neural network with one hidden layer of 64 ReLU units and dropout, with five softmax heads trained together using Adam (`src/ml/nn.ts`, no libraries).

The one better on validation is saved in 8 bits, one scale per row; that was DL. It reads phrasing, not meaning, and it is always available: nothing to download.

| Gold set, macro-F1 | ML | DL |
|---|---|---|
| act | 85.6% | 88.9% |
| direction | 77.3% | 88.3% |
| cause | 90.8% | 94.0% |
| time | 77.8% | 79.0% |
| mood | 72.1% | 74.1% |
| **mean** | **80.7%** | **84.9%** |

On the test set the means are 79.1% (ML) and 81.9% (DL). `report.md` has accuracy, the confusion tables and every gold sentence the chosen model got wrong.

### Language model (downloaded only when the person says so)

- **What it is.** `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, a pretrained multilingual sentence-embedding model (384 dimensions), run 8-bit in a Web Worker by transformers.js on WebAssembly.
- **Size and where it comes from.** About 118 MB from huggingface.co (or a host set in Settings), kept by the browser, so it works offline after the first time. Its runtime (ONNX Runtime for WebAssembly, CPU only, 14 MB) comes with the app.
- **Its heads.** They are trained on the device the first time: the sample is embedded, and a network with one hidden layer of 128 units learns the five heads. A tenth of the sample is kept aside; Settings shows how well the heads read it.
- **Close in meaning.** It also makes "close in meaning" possible: cosine similarity between a sentence and an element (its name and summary). The threshold for "close" is measured on the person's own links: the best F1 between the elements their notes are linked to and the ones they are not, from 8 links on. Until then the default is 0.55.
- **Not measured here.** Its scores on the gold set could not be measured in this repository (the build environment cannot reach huggingface.co), so none are claimed.

## Learning from the person

Everything it learns is kept with the atlas (`learning.ml`), shown in Settings, and can be forgotten.

- **Corrections.** In a note's panel, under "How the local AI read each sentence", the person can correct any answer. The same sentence then reads as they said. A copy of the heads is fine-tuned on all corrections (the last 300), so similar sentences lean that way.
- **Links.** A note they link to an element is an example of what that element is about. A link by meaning they take back is an example of what it is not about (12 of each per element). Close-in-meaning compares sentences with both, and never offers again what was taken back.

## Forecast

`src/ml/forecast.ts` says when a repeat may come next. It needs at least three gaps between the times the repeat happened.

- **The usual gap** is the middle half of those gaps (first to third quartile).
- **The forecast window** is that far after the last time. When the longer usual gap is more than four times the shorter, it says the gaps vary too much to tell instead.
- **Where it shows.** In the Repeats notes, as a forecast, never as a time the repeat happened.

## Make it again

```bash
npm run ml:data    # writes data/train.jsonl, data/test.jsonl and public/ml/sample.json
npm run ml:train   # trains ML and DL, writes report.md and public/ml/lite.json
npm test           # src/ml/*.test.ts check the network, the shipped model and the reader
```
