# RE:VISION — AI Perception Stress-Test Lab

### From Detection to Investigation

**YUKTHI 2026 | Mohan Babu University**

> **See the Change. Understand the Prediction.**

RE:VISION is an AI-powered computer vision testing concept designed to help users investigate how changing image conditions can influence object detection predictions.

By modifying an image, running detection again, and comparing the results, RE:VISION aims to make changes in model predictions easier to observe and understand.

---

## 🎯 Problem Statement

Computer vision models can produce inconsistent object detection predictions under varying image conditions, such as lighting, blur, and occlusion.

Understanding how predictions change under these conditions is important when investigating the limitations of object detection systems.

## 💡 Our Solution

RE:VISION proposes an interactive environment for testing object detection under different image conditions.

Users can examine an original image, apply selected modifications, rerun detection, and compare the resulting predictions in one workflow.

### 🔄 How It Works

UPLOAD / CAPTURE → DETECT → MODIFY → RE-TEST → COMPARE

| Step | Description |
|---|---|
| 1. Upload / Capture | Provide an image for testing. |
| 2. Detect | Run object detection on the original image. |
| 3. Modify | Apply selected image transformations. |
| 4. Re-test | Run the same detection model on the modified image. |
| 5. Compare | Examine changes in detected objects and predictions. |

---

## ✨ Key Features

- **Image Input:** Upload an image for analysis.
- **Image Transformations:** Explore conditions such as brightness and blur.
- **Object Detection:** Identify supported objects using a detection model.
- **Prediction Comparison:** Compare original and modified image predictions.
- **Detection Analysis:** Examine changes in labels, confidence scores, and bounding boxes.
- **Experiment History:** Planned capability for revisiting previous tests.
- **Result Export:** Planned capability for exporting experiment results.

*Note: These are intended capabilities. Refer to the actual implementation to determine which features are currently functional.*

---

## 🚀 What Makes RE:VISION Different?

RE:VISION focuses on connecting image modification with repeated object detection and visual comparison.

Rather than examining a prediction in isolation, the proposed workflow helps users investigate questions such as:

- Does an object remain detectable after image blur?
- How do brightness changes influence detection results?
- Which detections disappear or change after a transformation?
- How do the original and modified predictions differ?

The goal is to make computer vision testing more interactive, visual, and accessible.

---

## 🛠️ Proposed Technology Stack

| Technology | Purpose |
|---|---|
| React | User interface |
| TypeScript | Application development |
| Vite | Development and build tooling |
| Browser Canvas API | Image manipulation |
| MediaDevices API | Webcam access, if implemented |
| TensorFlow.js | Browser-based machine learning |
| COCO-SSD | Object detection |
| Recharts | Visualisation, if implemented |
| IndexedDB | Local experiment storage, if implemented |

*This is the proposed technology stack. Update it to match the technologies actually used in the implementation.*

---

## 🔬 Testing Approach

RE:VISION aims to support experiments using different image conditions, including:

- Brightness variation
- Image blur
- Contrast variation
- Partial object occlusion

For each test, users can compare the predictions generated from the original and modified images.

These comparisons can help illustrate how a model responds to particular image changes. However, a small number of experiments cannot establish overall model robustness.

---

## ⚠️ Limitations

- Detection results depend on the selected model.
- COCO-SSD supports a limited set of object categories.
- Confidence scores are not guaranteed probabilities of correctness.
- Results from a small test set cannot establish general robustness.
- Some proposed features may not yet be implemented.

---

## 🔮 Future Scope

- Save and revisit experiments.
- Export prediction comparisons.
- Introduce additional image transformations.
- Support additional object detection models.
- Generate summaries of prediction changes.
- Evaluate model behaviour across larger and more diverse datasets.

---

## 👥 Team Infinity Gauntlet

**Hackathon:** YUKTHI 2026  
**Institution:** Mohan Babu University  
**Theme:** AI & Automation *(confirm against the official hackathon theme)*

| Role | Name |
|---|---|
| Team Leader | N. Aishwarya |
| Team Member | P. Chandana |
| Team Member | P. Sree Harshitha |
| Team Member | P. Venu Munendra Kumar |
| Team Member | P. Sai Charan |
| Team Member | P. S. L. Sampath Kumar |

---

## 📌 Project Status

RE:VISION is a project concept focused on interactive computer vision testing and prediction comparison.

This repository will document the project's development, implementation, experiments, and future improvements as work progresses.

---

### RE:VISION
**From Detection to Investigation.**

*See the Change. Understand the Prediction.*
