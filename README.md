````markdown
<div align="center">

# ◉ RE:VISION — AI Perception Stress-Test Lab

### From Detection to Investigation

**YUKTHI 2026 | Mohan Babu University**

*See the Change. Understand the Prediction.*

</div>

## 🎯 About the Project

RE:VISION is an interactive computer vision testing platform that investigates how image changes affect object detection predictions.

Changes in lighting, blur, noise, or partial obstruction can affect which objects a model detects and where it places bounding boxes. RE:VISION helps users test these conditions and compare results systematically.

## 💡 Problem Statement

A successful object detection result on an original image does not necessarily show how a model will behave when image conditions change.

Variations in lighting, image quality, blur, and partial obstruction may affect detection results.

**The challenge is to investigate how object detection predictions change when the input image changes.**

## 🔄 How It Works

**UPLOAD / CAPTURE → DETECT → MODIFY → RE-TEST → COMPARE → INVESTIGATE**

| Step | Stage | Description |
|---|---|---|
| 01 | **Upload / Capture** | Provide an image for testing. |
| 02 | **Detect** | Identify objects in the original image. |
| 03 | **Modify** | Apply selected image transformations. |
| 04 | **Re-test** | Run detection on the modified image. |
| 05 | **Compare** | Examine detected objects, confidence scores, and bounding boxes. |
| 06 | **Investigate** | Analyze changes in detection behaviour. |

## ✨ Key Features

- 🖼️ **Image Input:** Upload images or capture them using a webcam.
- 🎛️ **Image Transformations:** Test brightness, blur, noise, and partial occlusion.
- 🤖 **Object Detection:** Detect supported objects using available models.
- 🧪 **Multi-Level Stress Testing:** Explore different transformation severity levels.
- 🔬 **Combined-Condition Testing:** Investigate multiple image transformations together.
- 📊 **Prediction Comparison:** Compare detections, confidence scores, object retention, and bounding-box overlap.
- 🔍 **Failure Investigation:** Examine cases where original detections are not retained.
- 🗂️ **Experiment Management:** Save, revisit, and compare experiments.
- 🖼️ **Failure Gallery:** Organize examples of detection failures.
- 📄 **Report Export:** Export experiment data and generate reports.

*Feature availability depends on the implemented workflow and selected model.*

## 🌟 What Makes RE:VISION Different?

| Traditional Detection Demo | RE:VISION |
|---|---|
| Shows an initial prediction | Tests predictions under changed image conditions |
| Focuses on detected objects | Investigates changes in detections |
| Provides a single result | Supports structured experimentation |
| Offers limited comparison | Helps analyze changes across tests |

RE:VISION does not introduce a new object detection algorithm. Its focus is an interactive workflow for testing, comparing, and investigating the behaviour of existing models.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React | Interactive user interface |
| TypeScript | Application logic and type safety |
| Vite | Development and build tooling |
| TensorFlow.js | Browser-based machine learning |
| COCO-SSD | Object detection |
| Hugging Face Transformers | Additional model support |
| Canvas API | Image transformations and rendering |
| Node.js | Backend runtime |
| Express.js | Backend API |
| SQLite | Data storage |
| Recharts | Data visualization |
| jsPDF | PDF report generation |
| Vitest | Automated testing |

## 🚀 Run Locally

### Prerequisites

- [Node.js](https://nodejs.org/)
- npm
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

**4. Start the development server**

```bash
npm run dev
```

**5. Open the application**

Open the local URL displayed in your terminal. For a typical Vite project, this is:

`http://localhost:5173`

### Build for Production

```bash
npm run build
```

*Note: These commands assume the repository root contains the required npm scripts. If the project uses a separate backend or environment variables, configure and start those components as needed.*

## 🎯 Who Can Benefit?

- **AI/ML Students:** Explore how image variations affect object detection.
- **Developers:** Investigate challenging detection scenarios.
- **Researchers:** Conduct structured image-condition experiments.
- **Educators:** Demonstrate computer vision concepts and model limitations.
- **AI Enthusiasts:** Explore how models respond to changing visual inputs.

*RE:VISION is an exploratory testing platform. Its results alone do not establish general-purpose model robustness.*

## 🚀 Project Vision

RE:VISION aims to make computer vision testing more interactive, structured, and accessible by connecting image transformations with repeated detection, prediction comparison, and analysis.

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

- N. Aishwarya
- P. Chandana
- P. Sree Harshitha
- P. Venu Munendra Kumar
- P. Sai Charan
- P. S. L. Sampath Kumar

---

<div align="center">

**Built with curiosity, collaboration, and a vision for more reliable AI.**

*RE:VISION — From Detection to Investigation*

</div>
```` 
