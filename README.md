# RE:VISION: AI Perception Stress-Test Lab

Change an image, run the same detector again, and see exactly what moved. Choose one of five detection models, stress it with 13 kinds of image change, and save, share, compare and reproduce the results with your team.

## Run locally

Needs Node.js 20.19+ or 22.12+.

1. Create a Firebase project and register a Web app (see [Firebase setup](#firebase-setup)).
2. Copy `.env.example` to `.env.local` and fill in the Firebase Web app configuration.
3. Run:

   ```bash
   npm install
   npm run dev
   ```

The Vite development server prints the local URL. `npm test` runs the analysis and legacy API tests; `npm run lint` runs Oxlint.

## Deploy to Vercel

1. Push this project to a Git provider such as GitHub.
2. In Vercel, select **Add New → Project** and import the repository.
3. Use the Vite defaults (build command `npm run build`, output directory `dist`). The included `vercel.json` also sets these values and enables SPA fallback.
4. In the Vercel project’s **Settings → Environment Variables**, add each `VITE_FIREBASE_*` value from your Firebase Web app configuration. Add them for Production (and Preview/Development if needed).
5. Deploy or redeploy. In Firebase Authentication → Settings → Authorized domains, add the Vercel domain shown on the deployment (and your custom domain, if used).

Firebase Web app configuration is embedded in the frontend bundle, so these `VITE_` values are public configuration, not server secrets. Do not put Firebase Admin credentials or service-account private keys in Vercel frontend environment variables.

## Firebase setup

The deployed app uses Firebase Authentication, Cloud Firestore, and Cloud Storage. No Express server or SQLite database is needed on Vercel.

1. In Firebase Console, create a project and add a Web app. Copy its configuration values into `.env.local` for local work and Vercel environment variables for deployment.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. Create a Firestore database and a Storage bucket.
4. Publish the access rules in `firestore.rules` and `storage.rules`. With Firebase CLI:

   ```bash
   npm install --global firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules,storage
   ```

   Choose the same Firebase project that owns the Web app when linking the CLI. You can also paste each rules file into its matching Firebase Console rules editor and publish.
5. Configure the Storage bucket’s CORS policy from `cors.json`. With Google Cloud CLI, select the Firebase project and run `gcloud storage buckets update gs://YOUR_STORAGE_BUCKET --cors-file=cors.json` (replace the bucket with the exact `storageBucket` value from your Firebase config). CORS permits the browser to read authenticated files; Firebase Storage rules still enforce access.
6. Add the exact Vercel domain to Firebase Authentication’s **Authorized domains**.

The app retains username-and-password sign-in by mapping each username to an encoded Firebase Authentication email alias under the reserved `.invalid` domain; users still enter their username in the app. These aliases do not receive email, so email verification and password-reset-by-email are not available. Firebase enforces unique usernames through its unique email account mapping.

Firebase Storage may require a billing-enabled Firebase plan. Review Firebase pricing and set usage alerts before inviting users. Firestore and Storage rules restrict experiment and image access to the owner or signed-in users when an experiment is shared.

## What it does

**Models** (pick one at a time; each downloads when first selected): COCO-SSD MobileNetV2 (default), COCO-SSD Lite, YOLOS Tiny, DETR ResNet-50, and OWL-ViT (open vocabulary: type what to find, such as "rupee note").

**Accuracy**: confidence slider that filters live without re-running; high-accuracy tiled mode for small or crowded objects; open-vocabulary search for things outside the 80 COCO classes.

**Stress testing**: 13 image changes (darken, blur, low contrast, box cover, noise, rotation, JPEG compression, low light, motion blur, crop, low resolution, haze, colour shift) at 5 severities. Rotation and crop move the expected boxes with the image. Automated combined cases (pairs or triples of conditions) are generated from a seeded sample, so the same settings give the same cases. Real-world photos can be compared with the simulated condition.

**Understanding the results**: robustness score with a radial chart per condition and a plain-language explanation; automatic written summary; per-class and per-object failure analysis (missed, confidence drop, shifted box, false detection); failure gallery with before and after crops.

**Teamwork**: username and password sign-in; experiments saved in Firebase and shared with signed-in users unless kept private; side-by-side comparison of two experiments; shared failure gallery.

**Reproducibility**: each experiment records the model and source, library versions, thresholds, settings, image SHA-256, the parameter used at every severity, seeds and the browser backend. "Re-run and verify" repeats a saved experiment and reports whether it reproduces.

**Export**: PNG and PDF reports; JSON export; webcam mode for live stress testing.

## Layout

```
src/services/   detection, transforms, Firebase persistence, analysis and reports
src/pages/      Lab, Experiments, Compare, Gallery, Login
src/components/ viewers, model picker, charts, panels
server/         legacy Express + SQLite API and its tests
firestore.rules Firebase document access rules
storage.rules   Firebase image/results access rules
```

## Things to know

- Scores are model confidence and box overlap, not accuracy against ground truth. Results apply to the one image tested.
- Models run in the browser, so the first use of each downloads it (OWL-ViT is the largest, roughly 150 MB) and large models are slow on weak machines.
- Reproduction can differ slightly between browsers or graphics backends. The verify step reports "close" when differences are tiny.
- Safari does not support the canvas filters some conditions use. Use Chrome, Edge or Firefox.
