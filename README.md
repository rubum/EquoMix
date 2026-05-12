# EquoMix

EquoMix is a high-fidelity DJ workstation specializing in advanced equalization. It features a unique dual-engine EQ system that allows you to switch between traditional Analog (IIR) and high-precision Spectral (FFT-Linear) processing for phase-accurate sound sculpting and studio-grade performance.

![EquoMix Studio Interface](./src/assets/equomix-studio.png)

## 🚀 Key Features

### 🎚️ Dual-Engine Master EQ
The heart of EquoMix is its versatile Master EQ section, featuring two distinct DSP architectures:
- **Analog (IIR) Mode**: Mimics classic hardware behavior using minimum-phase Biquad filters. Warm, musical, and zero-latency.
- **Spectral (FFT) Mode**: A professional linear-phase engine using Fast Fourier Transforms. Perfect for transparent mixing without phase distortion (ideal for mastering).

### 💿 Precision Decks
- **Dual Deck Architecture**: Independent control over Deck A and Deck B.
- **Dynamic Waveforms**: High-performance canvas-based waveform rendering with interactive scrubbing.
- **Hardware-Like Controls**: Integrated jog wheels with rotation tracking and progress rings.
- **Pitch & BPM**: Real-time pitch shifting and automatic BPM detection for seamless tempo matching.

### 🧪 Advanced DSP Tools
- **Vocal Kill**: Real-time center-channel subtraction for creating instant acapellas or instrumentals.
- **Interactive Spectrogram**: A "waterfall" style spectral analyzer with logarithmic frequency mapping.
- **Constant Power Crossfading**: Smooth, studio-grade blending between decks.

## 🛠️ Technical Stack
- **Core Engine**: Web Audio API (Advanced DSP Routing).
- **Processing**: [fft.js](https://github.com/indutny/fft.js) for high-performance spectral calculations.
- **Visuals**: HTML5 Canvas API with hardware-accelerated rendering.
- **Bundling**: [Vite](https://vitejs.dev/) for ultra-fast development and build.

## 📥 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- A modern browser with Web Audio support (Chrome/Edge/Safari/Firefox)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/EquoMix.git
   cd EquoMix
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the studio:
   ```bash
   npm run dev
   ```

## 🎮 How to Use
1. **Load Media**: Click "LOAD TRACK" on either deck to select an audio file from your system.
2. **Play/Pause**: Use the center play button on the jog wheel.
3. **Mix**: Use the Crossfader to blend between Deck A and Deck B.
4. **Sculpt Sound**: Interact with the Master Analyzer or the EQ cards below to adjust frequency bands. 
5. **Switch Engines**: Toggle between **ANALOG** and **SPECTRAL** in the sidebar to hear the difference in phase response.

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

---
*EquoMix – Reference Grade DJ Workstation. Built for the future of web audio.*
