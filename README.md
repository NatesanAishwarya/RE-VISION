# RE:VISION — AI Perception Stress-Test Lab

### From Detection to Investigation

**YUKTHI 2026 | Mohan Babu University | Team Infinity Gauntlet**

 **See the Change. Understand the Prediction.**

RE:VISION is an interactive computer vision testing platform that investigates how image conditions affect object detection predictions. Users can modify images, test different detection models, analyse prediction changes, and compare results through a unified interface.

---

## 🎯 Problem Statement

Computer vision models may produce inconsistent predictions when images contain blur, low light, noise, occlusion, or other visual changes. Understanding these changes is important when investigating the limitations of object detection systems.

## 💡 Our Solution

RE:VISION provides an interactive environment for testing object detection under different image conditions. Users can modify images, rerun detection, analyse prediction changes, and investigate model behaviour through structured experiments.

### 🔄 How It Works

**UPLOAD / CAPTURE → DETECT → MODIFY → RE-TEST → ANALYSE → COMPARE**

---

## ✨ Key Features

- **Image Upload & Webcam Capture:** Upload images or capture frames for testing.
- **Multiple Detection Models:** Experiment with COCO-SSD, YOLOS, DETR, and OWL-ViT.
- **Image Transformations:** Test brightness, blur, noise, occlusion, rotation, cropping, low light, and other visual conditions.
- **Automated Stress Testing:** Test multiple conditions across different severity levels.
- **Combined Transformations:** Investigate the effects of multiple image changes together.
- **Prediction Analysis:** Examine detection retention, confidence changes, bounding boxes, and IoU.
- **Robustness Analysis:** Explore how detection results change across tested conditions.
- **Experiment Management:** Save, revisit, and share experiments.
- **Side-by-Side Comparison:** Compare saved experiments and model behaviour.
- **Failure Gallery:** Collect and investigate detection failures.
- **Report Export:** Export experiment reports in PNG, PDF, and JSON formats.

---

## 🚀 What Makes RE:VISION Different?

RE:VISION connects image modification, repeated detection, automated testing, and prediction analysis in one workflow.

Instead of viewing a single detection result, users can investigate:

- Does an object remain detectable after blur or low light?
- How do different models respond to the same image transformation?
- Which conditions cause detections to disappear or change?
- How do combined transformations influence prediction results?

**Our focus is not on creating another detection algorithm, but on making model behaviour easier to test, compare, and investigate.**

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React + TypeScript | Interactive user interface |
| Vite | Development and build tooling |
| TensorFlow.js + COCO-SSD | Browser-based object detection |
| Hugging Face Transformers | Transformer-based detection models |
| HTML Canvas API | Image transformations |
| Node.js + Express.js | Backend and API |
| SQLite | User and experiment data storage |
| Recharts | Data visualisation |
| jsPDF | PDF report generation |
| Vitest | Automated testing |

---

## 🔬 Testing Approach

RE:VISION supports experiments involving brightness, blur, contrast, noise, occlusion, rotation, compression, low resolution, and other image transformations.

The system compares original and transformed-image predictions using detection retention, confidence scores, bounding-box overlap, and related analysis metrics.

*Note: The robustness score is a project-defined experimental measure. Results depend on the selected model, image, and test conditions; they do not independently establish real-world model reliability.*

---

## ⚠️ Limitations

- Detection performance depends on the selected model and configuration.
- Supported object categories vary between models.
- Confidence scores do not guarantee prediction correctness.
- Simulated image conditions may differ from real-world scenarios.
- Limited experiments cannot establish general model robustness.

---

## 🔮 Future Scope

- Evaluate models using larger, labelled datasets.
- Add more detection models and image transformations.
- Support custom datasets and reference annotations.
- Improve robustness metrics and failure explanations.
- Introduce batch testing and advanced experiment analytics.

---

## 🎯 Who Can Benefit?

- **AI/ML Students:** Explore how image variations affect object detection.
- **Developers:** Investigate challenging detection scenarios.
- **Researchers:** Conduct structured image-condition experiments.
- **Educators:** Demonstrate computer vision concepts and model limitations.
- **AI Enthusiasts:** Explore how models respond to changing visual inputs.

---

## 💻 Run Locally

Follow these steps to run RE:VISION on your computer.

### Prerequisites

- [Node.js](https://nodejs.org/) and npm
- Git

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/NatesanAishwarya/RE-VISION.git
```

**2. Navigate to the project directory**

```bash
cd RE-VISION
```

**3. Install dependencies**

```bash
npm install
```

**4. Start the application**

```bash
npm run dev
```

**5. Open the application**

Open the local URL displayed in your terminal.

*Note: Start any additional backend service if required by your project configuration.*

---

## 📌 Project Status

RE:VISION is an interactive computer vision testing prototype integrating object detection, image transformations, stress testing, prediction analysis, experiment comparison, and reporting.

The project aims to make computer vision testing more **interactive, systematic, and accessible**.

---

## 🚀 Project Vision

RE:VISION aims to connect image transformations with repeated detection, prediction comparison, and analysis to make model behaviour easier to investigate.

<div align="center">

### Don't just see what AI detects.

### Investigate what changes.

**RE:VISION — See the Change. Understand the Prediction.**

</div>

---

## 👥 Team Infinity Gauntlet

**Hackathon:** YUKTHI 2026  
**Institution:** Mohan Babu University  
**Theme:** AI & Automation

### Team Members

- N. Aishwarya — Team Leader
- P. Chandana
- P. Sree Harshitha
- P. Venu Munendra Kumar
- P. Sai Charan
- P. S. L. Sampath Kumar

---
**Built with curiosity, collaboration, and a vision for more reliable AI.**
---
**RE:VISION — From Detection to Investigation.**
