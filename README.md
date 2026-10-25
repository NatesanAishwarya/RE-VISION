# RE:VISION: AI Perception Stress-Test Lab

Change an image, run the same detector again, and see exactly what moved. Choose one of five detection models, stress it with 13 kinds of image change, and save, share, compare and reproduce the results with your team.

## Run it

Needs Node 20.19+ or 22.12+.

```bash
npm install            # if onnxruntime-node fails to download a binary: npm install --ignore-scripts
npm run dev            # web app on http://localhost:5173 and API on http://localhost:3001
```

Production: `npm start` builds the app and serves it, with the API, on http://localhost:3001.
Tests: `npm test` (51 tests: analysis logic and the API). Lint: `npm run lint`.

The first time you open it, create an account. Experiments are stored in a SQLite database at `server/data/revision.db` (created automatically, git-ignored). Set `PORT` or `DB_FILE` to change where the server listens or stores data.

## What it does

**Models** (pick one at a time; each downloads when first selected)
COCO-SSD MobileNetV2 (default), COCO-SSD Lite, YOLOS Tiny, DETR ResNet-50, and OWL-ViT (open vocabulary: type what to find, such as "rupee note").

**Accuracy**
Confidence slider that filters live without re-running; high-accuracy tiled mode for small or crowded objects; open-vocabulary search for things outside the 80 COCO classes.

**Stress testing**
13 image changes (darken, blur, low contrast, box cover, noise, rotation, JPEG compression, low light, motion blur, crop, low resolution, haze, colour shift) at 5 severities. Rotation and crop move the expected boxes with the image. Automated combined cases (pairs or triples of conditions) are generated from a seeded sample, so the same settings give the same cases. Real-world photos can be compared with the simulated condition.

**Understanding the results**
Robustness score with a radial chart per condition and a plain-language explanation; automatic written summary; per-class and per-object failure analysis (missed, confidence drop, shifted box, false detection); failure gallery with before and after crops.

**Teamwork**
Username and password sign-in; experiments saved to the database and shared with everyone who signs in (or kept private); side-by-side comparison of two experiments; shared failure gallery.

**Reproducibility**
Each experiment records the model and source, library versions, thresholds, settings, image SHA-256, the parameter used at every severity, seeds and the browser backend. "Re-run and verify" repeats a saved experiment and reports whether it reproduces.

**Export**
PNG and PDF reports; JSON export; webcam mode for live stress testing.

## Layout

```
src/services/   detection, transforms, comparison, analysis, report (plain TypeScript, unit-tested)
src/pages/      Lab, Experiments, Compare, Gallery, Login
src/components/ viewers, model picker, charts, panels
server/         Express + SQLite API (accounts, sessions, experiments, gallery)
```

## Things to know

- Scores are model confidence and box overlap, not accuracy against ground truth. Results apply to the one image tested.
- Models run in the browser, so the first use of each downloads it (OWL-ViT is the largest, roughly 150 MB) and large models are slow on weak machines.
- Reproduction can differ slightly between browsers or graphics backends. The verify step reports "close" when differences are tiny.
- Passwords are hashed with scrypt and sessions use HTTP-only cookies. For a public deployment, put the server behind HTTPS.
- Safari does not support the canvas filters some conditions use. Use Chrome, Edge or Firefox.
