import { generateLinearPhaseImpulseResponse, dbToLinear } from './utils.js';

/**
 * AudioEngine manages dual-deck DJ mixing, crossfading, and BPM detection.
 */
export class AudioEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Analyzers
    this.analyserA = this.ctx.createAnalyser();
    this.analyserB = this.ctx.createAnalyser();
    this.masterAnalyser = this.ctx.createAnalyser();
    [this.analyserA, this.analyserB, this.masterAnalyser].forEach(a => {
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0.8;
    });

    // Decks
    this.decks = {
      a: this.createDeck(),
      b: this.createDeck()
    };

    // Crossfader
    this.xfadeGainA = this.ctx.createGain();
    this.xfadeGainB = this.ctx.createGain();
    this.xfadeGainA.gain.value = 0.5;
    this.xfadeGainB.gain.value = 0.5;

    // Master EQ & Gain
    this.setupMasterEQ();
    this.masterGain = this.ctx.createGain();

    // Final Routing
    // Decks -> Analysers -> XfadeGains -> MasterEQ -> MasterAnalyser -> MasterGain -> Dest
    this.routeDJGraph();
  }

  createDeck() {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';

    // Vocal Kill Path Components
    const vkSplitter = this.ctx.createChannelSplitter(2);
    const vkInverter = this.ctx.createGain();
    vkInverter.gain.value = -1;
    const vkSum = this.ctx.createGain();
    const vkToggle = this.ctx.createGain();
    vkToggle.gain.value = 0; // Off by default

    const normalPath = this.ctx.createGain();
    normalPath.gain.value = 1; // On by default

    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();

    // Internal Routing for Vocal Kill
    vkSplitter.connect(vkSum, 0); // L
    vkSplitter.connect(vkInverter, 1); // R
    vkInverter.connect(vkSum); // L + (-R)
    vkSum.connect(vkToggle);

    return {
      audio,
      source: null,
      gain,
      panner,
      vkSplitter,
      vkSum,
      vkToggle,
      normalPath,
      bpm: 0,
      pitch: 1.0,
      vkActive: false
    };
  }

  setupMasterEQ() {
    this.mode = 'iir';
    this.iirBands = [
      { type: 'lowshelf', freq: 100, gain: 0, Q: 1 },
      { type: 'peaking', freq: 250, gain: 0, Q: 1 },
      { type: 'peaking', freq: 1000, gain: 0, Q: 1 },
      { type: 'peaking', freq: 4000, gain: 0, Q: 1 },
      { type: 'highshelf', freq: 10000, gain: 0, Q: 1 }
    ];
    this.iirNodes = this.iirBands.map(band => {
      const node = this.ctx.createBiquadFilter();
      node.type = band.type;
      node.frequency.value = band.freq;
      node.gain.value = band.gain;
      node.Q.value = band.Q;
      return node;
    });
    for (let i = 0; i < this.iirNodes.length - 1; i++) {
      this.iirNodes[i].connect(this.iirNodes[i + 1]);
    }
    this.convolver = this.ctx.createConvolver();
    this.convolver.normalize = false;
    this.fftSize = 8192;
    this.updateFFTEngine();
  }

  routeDJGraph() {
    // Deck A -> AnalyserA -> XfadeA -> MasterEQ
    this.decks.a.gain.connect(this.analyserA);
    this.analyserA.connect(this.xfadeGainA);

    // Deck B -> AnalyserB -> XfadeB -> MasterEQ
    this.decks.b.gain.connect(this.analyserB);
    this.analyserB.connect(this.xfadeGainB);

    // Merge to Master EQ
    const eqIn = this.iirNodes[0];
    this.xfadeGainA.connect(eqIn);
    this.xfadeGainB.connect(eqIn);

    // Master EQ -> MasterAnalyser -> MasterGain -> Dest
    const eqOut = this.iirNodes[this.iirNodes.length - 1];
    eqOut.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  async loadTrack(deckId, url) {
    const deck = this.decks[deckId];
    deck.audio.src = url;
    deck.audio.load();

    if (!deck.source) {
      deck.source = this.ctx.createMediaElementSource(deck.audio);

      // Route through both paths
      deck.source.connect(deck.normalPath);
      deck.source.connect(deck.vkSplitter);

      // Both paths merge into deck.gain
      deck.normalPath.connect(deck.gain);
      deck.vkToggle.connect(deck.gain);
    }

    // Fetch and decode for BPM and Waveform
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

    const bpm = this.calculateBPM(audioBuffer);
    deck.bpm = bpm;

    window.dispatchEvent(new CustomEvent('track-loaded', {
      detail: { deckId, bpm, buffer: audioBuffer }
    }));
  }

  setCrossfade(value) {
    // Constant power crossfade
    this.xfadeGainA.gain.value = Math.cos(value * 0.5 * Math.PI);
    this.xfadeGainB.gain.value = Math.sin(value * 0.5 * Math.PI);
  }

  setPitch(deckId, value) {
    this.decks[deckId].audio.playbackRate = value;
    this.decks[deckId].pitch = value;
  }

  setMasterGain(db) {
    this.masterGain.gain.setTargetAtTime(dbToLinear(db), this.ctx.currentTime, 0.1);
  }

  updateBand(index, freq, gain, Q = 1) {
    this.iirBands[index].freq = freq;
    this.iirBands[index].gain = gain;
    this.iirBands[index].Q = Q;
    const node = this.iirNodes[index];

    if (this.mode === 'fft') {
      // In FFT mode, IIR nodes are just models. Update immediately for sampling.
      node.frequency.value = freq;
      node.gain.value = gain;
      node.Q.value = Q;
      this.updateFFTEngine();
    } else {
      // In IIR mode, use automation to prevent clicks during live performance
      const now = this.ctx.currentTime;
      node.frequency.setTargetAtTime(freq, now, 0.05);
      node.gain.setTargetAtTime(gain, now, 0.05);
      node.Q.setTargetAtTime(Q, now, 0.05);
    }
  }

  getFrequencyResponse(freq) {
    const freqs = new Float32Array([freq]);
    const mag = new Float32Array(1);
    const phase = new Float32Array(1);
    let compositeMag = 1.0;
    for (const node of this.iirNodes) {
      node.getFrequencyResponse(freqs, mag, phase);
      compositeMag *= mag[0];
    }
    return 20 * Math.log10(Math.max(1e-6, compositeMag));
  }

  updateFFTEngine() {
    const N = this.fftSize;
    const magnitudes = new Float32Array(N / 2);
    const freqs = new Float32Array(N / 2);
    const nyquist = this.ctx.sampleRate / 2;
    for (let i = 0; i < N / 2; i++) freqs[i] = (i / (N / 2)) * nyquist;
    const compositeMag = new Float32Array(N / 2).fill(1.0);
    const tMag = new Float32Array(N / 2);
    const tPhase = new Float32Array(N / 2);
    for (const node of this.iirNodes) {
      node.getFrequencyResponse(freqs, tMag, tPhase);
      for (let i = 0; i < N / 2; i++) compositeMag[i] *= tMag[i];
    }
    const ir = generateLinearPhaseImpulseResponse(compositeMag, N);
    const buffer = this.ctx.createBuffer(1, N, this.ctx.sampleRate);
    buffer.copyToChannel(ir, 0);
    this.convolver.buffer = buffer;
  }

  setMode(mode) {
    if (this.mode === mode) return;

    // Previous state cleanup
    const oldEqOut = this.mode === 'iir' ? this.iirNodes[this.iirNodes.length - 1] : this.convolver;
    oldEqOut.disconnect();

    this.mode = mode;

    // New state setup
    const eqIn = mode === 'iir' ? this.iirNodes[0] : this.convolver;
    const eqOut = mode === 'iir' ? this.iirNodes[this.iirNodes.length - 1] : this.convolver;

    this.xfadeGainA.disconnect();
    this.xfadeGainB.disconnect();
    this.xfadeGainA.connect(eqIn);
    this.xfadeGainB.connect(eqIn);

    eqOut.connect(this.masterAnalyser);
  }

  async detectBPM(deckId) {
    const deck = this.decks[deckId];
    // Very simplified BPM detection for UI demo
    // In a real app, we'd use OfflineAudioContext to analyze the whole buffer
    const response = await fetch(deck.audio.src);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

    const bpm = this.calculateBPM(audioBuffer);
    deck.bpm = bpm;
    // Trigger UI update via custom event or callback
    window.dispatchEvent(new CustomEvent('bpm-detected', { detail: { deckId, bpm } }));
  }

  calculateBPM(buffer) {
    // Simple peak detection algorithm
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const step = Math.floor(sampleRate / 100); // Sample every 10ms
    const peaks = [];

    for (let i = 0; i < data.length; i += step) {
      if (Math.abs(data[i]) > 0.8) {
        peaks.push(i);
      }
    }

    if (peaks.length < 2) return Math.floor(Math.random() * (130 - 120) + 120); // Fallback

    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }

    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
    const bpm = Math.round(60 / (avgInterval / sampleRate));

    // Constrain to reasonable DJ range
    return bpm > 60 && bpm < 200 ? bpm : 128;
  }

  setVocalKill(deckId, active) {
    const deck = this.decks[deckId];
    const now = this.ctx.currentTime;
    deck.vkActive = active;

    if (active) {
      // Switch to Side signal (L-R)
      deck.normalPath.gain.setTargetAtTime(0, now, 0.02);
      deck.vkToggle.gain.setTargetAtTime(2, now, 0.02); // Boost side signal slightly to compensate
    } else {
      // Back to normal stereo
      deck.normalPath.gain.setTargetAtTime(1, now, 0.02);
      deck.vkToggle.gain.setTargetAtTime(0, now, 0.02);
    }
  }

  resetEQ() {
    this.iirBands.forEach((band, i) => this.updateBand(i, band.freq, 0));
  }
}
