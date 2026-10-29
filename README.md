# RE:VISION: AI Perception Stress-Test Lab

Change an image, run the same detector again, and see exactly what moved. Choose one of five detection models, stress it with 13 kinds of image change, and save, share, compare and reproduce the results with your team.

## Run locally

Needs Node.js 20.19+ or 22.12+.

1. Create a Firebase project and register a Web app (see [Firebase setup](#firebase-setup)).
2. Copy `.env.example` to `.env.local` and fill in the Firebase Web app configuration and Firebase service-account JSON.
3. Link a Vercel project, create a **private** Blob store, and pull its development environment variables:

   ```bash
   npx vercel link
   npx vercel blob create-store revision-files --access private --yes
   npx vercel env pull .env.local
   ```

4. Run `npx vercel dev` to use the app and its private-file API locally. `npm run dev` starts only Vite; saving/loading files requires the Vercel API routes. `npm test` runs the analysis and legacy API tests; `npm run lint` runs Oxlint.

## Deploy to Vercel

1. In Vercel, import this GitHub project.
2. Use the Vite defaults (build command `npm run build`, output directory `dist`). The included `vercel.json` also sets these values and enables SPA fallback.
3. In the Vercel project’s **Storage** section, create a **private Vercel Blob** store and connect it to the project’s Production and Preview environments. Vercel supplies `BLOB_READ_WRITE_TOKEN`.
4. In **Settings → Environment Variables**, add the `VITE_FIREBASE_*` values for the Firebase Web app and `FIREBASE_SERVICE_ACCOUNT_JSON` containing the full Firebase service-account JSON. The service-account value is server-only; never prefix it with `VITE_`.
5. Deploy or redeploy. In Firebase Authentication → Settings → Authorized domains, add the Vercel domain shown on the deployment (and your custom domain, if used).

Firebase Web app configuration is embedded in the frontend bundle, so `VITE_FIREBASE_*` values are public configuration, not server secrets. Keep `FIREBASE_SERVICE_ACCOUNT_JSON` and Vercel's Blob token private.

## Firebase setup

The app uses Firebase Authentication and Cloud Firestore for accounts and experiment metadata. Vercel Blob stores experiment images and result data in a **private** store. No Firebase Storage bucket or Express/SQLite server is needed on Vercel.

1. In Firebase Console, create a project and add a Web app. Copy its configuration values to `.env.local` and Vercel environment variables.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. Create a Firestore database and publish `firestore.rules`. With Firebase CLI:

   ```bash
   npm install --global firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules
   ```

4. Create a Firebase service-account key in **Project settings → Service accounts**. Put the full JSON key in `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel (and `.env.local` only for local API development). This is used by the serverless API to verify Firebase sessions and enforce owner/shared access before serving files. Do not commit the key or expose it to the browser.
5. Add the exact Vercel domain to Firebase Authentication’s **Authorized domains**.

The app retains username-and-password sign-in by mapping each username to an encoded Firebase Authentication email alias under the reserved `.invalid` domain; users still enter their username in the app. These aliases do not receive email, so email verification and password-reset-by-email are not available. Firebase enforces unique usernames through its unique email account mapping.

## Storage cost and limits

Vercel Blob is free on the Hobby plan within its included limits: 1 GB of storage per month, the first 10,000 simple operations, the first 2,000 advanced operations, and the first 10 GB of Blob data transfer. The Hobby allowance is shared across Vercel services in the project. Vercel says Hobby users are not charged for over-limit usage, but Blob becomes unavailable until the usage window resets. Check the [current Vercel Blob pricing and limits](https://vercel.com/docs/vercel-blob/usage-and-pricing) before launch.

Private Blob files are streamed through authenticated Vercel Functions, which adds function requests and data transfer. Firebase Firestore and Authentication have their own quotas and pricing; review Firebase pricing too.

## What it does

**Models** (pick one at a time; each downloads when first selected): COCO-SSD MobileNetV2 (default), COCO-SSD Lite, YOLOS Tiny, DETR ResNet-50, and OWL-ViT (open vocabulary: type what to find, such as "rupee note").

**Accuracy**: confidence slider that filters live without re-running; high-accuracy tiled mode for small or crowded objects; open-vocabulary search for things outside the 80 COCO classes.

**Stress testing**: 13 image changes (darken, blur, low contrast, box cover, noise, rotation, JPEG compression, low light, motion blur, crop, low resolution, haze, colour shift) at 5 severities. Rotation and crop move the expected boxes with the image. Automated combined cases (pairs or triples of conditions) are generated from a seeded sample, so the same settings give the same cases. Real-world photos can be compared with the simulated condition.

**Understanding the results**: robustness score with a radial chart per condition and a plain-language explanation; automatic written summary; per-class and per-object failure analysis (missed, confidence drop, shifted box, false detection); failure gallery with before and after crops.

**Teamwork**: username and password sign-in; experiments saved in Firebase and Vercel Blob and shared with signed-in users unless kept private; side-by-side comparison of two experiments; shared failure gallery.

**Reproducibility**: each experiment records the model and source, library versions, thresholds, settings, image SHA-256, the parameter used at every severity, seeds and the browser backend. "Re-run and verify" repeats a saved experiment and reports whether it reproduces.

**Export**: PNG and PDF reports; JSON export; webcam mode for live stress testing.

## Layout

```
src/services/   detection, transforms, Firebase/Blob persistence, analysis and reports
src/pages/      Lab, Experiments, Compare, Gallery, Login
src/components/ viewers, model picker, charts, panels
api/            authenticated Vercel Functions for private Blob files
server/         legacy Express + SQLite API and its tests
firestore.rules Firebase document access rules
```

## Things to know

- Scores are model confidence and box overlap, not accuracy against ground truth. Results apply to the one image tested.
- Models run in the browser, so the first use of each downloads it (OWL-ViT is the largest, roughly 150 MB) and large models are slow on weak machines.
- Reproduction can differ slightly between browsers or graphics backends. The verify step reports "close" when differences are tiny.
- Safari does not support the canvas filters some conditions use. Use Chrome, Edge or Firefox.
