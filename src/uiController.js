/**
 * UIController manages the Hyper-Premium Cyberpunk Equomix Studio.
 */
export class UIController {
  constructor(audioEngine) {
    console.log('Equomix Cyber Pro: Initializing State-of-the-Art Workspace...');
    this.engine = audioEngine;
    this.canvas = document.getElementById('eq-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Hardware Palette
    this.colors = {
      cyan: '#3498db', // Pro Cobalt Blue
      green: '#e67e22', // Pro Studio Amber
      red: '#e74c3c',
      bands: [
        '#eb4d4b', // Ruby Low
        '#f0932b', // Amber Low-Mid
        '#6ab04c', // Moss Mid
        '#22a6b3', // Teal High-Mid
        '#3498db'  // Cobalt High
      ],
      bg: '#0a0b10'
    };

    // UI Elements
    this.decks = {
      a: this.initDeckUI('a'),
      b: this.initDeckUI('b')
    };

    this.crossfader = document.getElementById('crossfader');
    this.masterGainSlider = document.getElementById('master-gain-slider');
    this.masterGainVal = document.getElementById('master-gain-val');
    this.resetBtn = document.getElementById('reset-eq');
    this.btnIir = document.getElementById('btn-iir');
    this.btnFft = document.getElementById('btn-fft');
    this.overlayContainer = document.getElementById('eq-bands-overlay');
    this.bandCards = [];

    // Meters
    this.vuA = { fill: document.getElementById('vu-a-fill'), peak: 0 };
    this.vuB = { fill: document.getElementById('vu-b-fill'), peak: 0 };

    this.audioUpload = document.getElementById('audio-upload');
    this.pendingDeck = null;

    // Particle System
    this.particles = [];

    // Interaction
    this.activeNodeIndex = -1;
    this.hoverNodeIndex = -1;
    this.isDragging = false;
    this.mouseX = -1;
    this.mouseY = -1;
    this.nodes = [];

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.setupEventListeners();
    this.createBandModules();
    this.startRenderLoop();
  }

  updateEffectiveBPM(id) {
    const d = this.decks[id];
    const pitch = this.engine.decks[id].pitch;
    if (d.baseBPM) {
      const effective = (d.baseBPM * pitch).toFixed(1);
      d.bpm.value = effective;
    }
  }

  initDeckUI(id) {
    return {
      playBtn: document.getElementById(`play-${id}`),
      name: document.getElementById(`name-${id}`),
      status: document.getElementById(`status-${id}`),
      bpm: document.getElementById(`bpm-${id}`),
      pitch: document.getElementById(`pitch-${id}`),
      pitchVal: document.getElementById(`pitch-val-${id}`),
      wave: document.getElementById(`wave-${id}`),
      jog: document.getElementById(`jog-${id}`),
      ring: document.getElementById(`ring-${id}`),
      timeReadout: document.getElementById(`time-${id}`),
      rotation: 0,
      upload: document.querySelector(`.upload-btn[data-deck="${id}"]`)
    };
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00:00.000';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width === 0) {
      setTimeout(() => this.resizeCanvas(), 100);
      return;
    }
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.updateNodePositionsFromEngine();
  }

  updateNodePositionsFromEngine() {
    this.nodes = this.engine.iirBands.map((band, i) => ({
      x: this.freqToX(band.freq),
      y: this.gainToY(band.gain),
      color: this.colors.bands[i]
    }));

    if (this.bandCards && this.bandCards.length) {
      // Cards are now persistently positioned by flexbox, no need to update left position.
    }
  }

  createBandModules() {
    if (!this.overlayContainer) return;
    this.overlayContainer.innerHTML = '';
    this.overlayContainer.className = 'eq-bands-overlay persistent';
    this.bandCards = [];

    const bandLabels = ['SUB-BASS', 'LOW-END', 'MID-RANGE', 'HIGH-MID', 'AIR-BAND'];

    this.engine.iirBands.forEach((band, i) => {
      const card = document.createElement('div');
      const rgb = this.hexToRgb(this.colors.bands[i]);

      card.className = 'eq-band-card persistent-card';

      card.innerHTML = `
        <div class="band-module-header">
          <div class="led-status" style="background: ${this.colors.bands[i]}; box-shadow: 0 0 10px ${this.colors.bands[i]};"></div>
          <div class="b-name">${bandLabels[i]}</div>
        </div>
        
        <div class="band-controls">
          <div class="ctrl-group">
            <div class="ctrl-header">
              <span class="label">FREQ</span>
              <span class="readout" id="ov-freq-${i}">${Math.round(band.freq)}Hz</span>
            </div>
            <input type="range" class="eq-mini-slider freq-slider" id="sl-freq-${i}" data-band="${i}" min="0" max="1000" value="${this.freqToSlider(band.freq)}" />
          </div>
          
          <div class="ctrl-group">
            <div class="ctrl-header">
              <span class="label">GAIN</span>
              <span class="readout" id="ov-gain-${i}">${band.gain.toFixed(1)}dB</span>
            </div>
            <input type="range" class="eq-mini-slider gain-slider" id="sl-gain-${i}" data-band="${i}" min="-24" max="24" step="0.1" value="${band.gain}" />
          </div>
        </div>
        
        <div class="module-footer">
          <span class="serial">CH-MOD-${(i + 1).toString().padStart(2, '0')}</span>
        </div>
      `;
      this.overlayContainer.appendChild(card);
      this.bandCards.push(card);
    });

    // Add mouse wheel support for sliders
    this.overlayContainer.querySelectorAll('.eq-mini-slider').forEach(el => {
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const direction = e.deltaY < 0 ? 1 : -1;
        const step = parseFloat(el.step) || (el.classList.contains('freq-slider') ? 10 : 0.5);
        const currentVal = parseFloat(el.value);
        el.value = currentVal + (direction * step);
        el.dispatchEvent(new Event('input'));
      }, { passive: false });
    });

    // Track slider dragging to prevent card movement feedback loop
    window.addEventListener('mouseup', () => { this.activeSlider = null; });
    window.addEventListener('touchend', () => { this.activeSlider = null; });

    this.overlayContainer.querySelectorAll('.eq-mini-slider').forEach(el => {
      el.addEventListener('mousedown', (e) => { this.activeSlider = e.target; });
      el.addEventListener('touchstart', (e) => { this.activeSlider = e.target; });
    });

    // Add event listeners for sliders
    this.overlayContainer.querySelectorAll('.freq-slider').forEach(el => {
      el.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.band);
        const val = parseFloat(e.target.value);
        const freq = this.sliderToFreq(val);
        this.engine.updateBand(i, freq, this.engine.iirBands[i].gain);
        this.updateNodePositionsFromEngine();
        this.updateBandModules(e.target);
      });
    });

    this.overlayContainer.querySelectorAll('.gain-slider').forEach(el => {
      el.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.band);
        const gain = parseFloat(e.target.value);
        this.engine.updateBand(i, this.engine.iirBands[i].freq, gain);
        this.updateNodePositionsFromEngine();
        this.updateBandModules(e.target);
      });
    });
  }

  freqToSlider(freq) {
    const minF = 20, maxF = 20000;
    const scale = (Math.log10(freq) - Math.log10(minF)) / (Math.log10(maxF) - Math.log10(minF));
    return scale * 1000;
  }

  sliderToFreq(val) {
    const minF = 20, maxF = 20000;
    const scale = val / 1000;
    return Math.pow(10, Math.log10(minF) + scale * (Math.log10(maxF) - Math.log10(minF)));
  }

  updateBandModules(excludeEl = null) {
    this.engine.iirBands.forEach((band, i) => {
      const freqEl = document.getElementById(`ov-freq-${i}`);
      const gainEl = document.getElementById(`ov-gain-${i}`);
      const slFreq = document.getElementById(`sl-freq-${i}`);
      const slGain = document.getElementById(`sl-gain-${i}`);

      if (freqEl) freqEl.textContent = `${Math.round(band.freq)}`;
      if (gainEl) gainEl.textContent = `${band.gain.toFixed(1)}`;
      if (slFreq && slFreq !== excludeEl) slFreq.value = this.freqToSlider(band.freq);
      if (slGain && slGain !== excludeEl) slGain.value = band.gain;
    });
  }

  setupEventListeners() {
    ['a', 'b'].forEach(id => {
      const d = this.decks[id];
      d.playBtn.addEventListener('click', () => {
        const audio = this.engine.decks[id].audio;
        if (audio.paused) {
          audio.play();
          d.playBtn.textContent = '||';
          d.playBtn.style.background = this.colors.cyan;
          d.playBtn.style.color = '#000';
        } else {
          audio.pause();
          d.playBtn.textContent = '▶';
          d.playBtn.style.background = '#fff';
          d.playBtn.style.color = '#000';
        }
      });
      d.pitch.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.engine.setPitch(id, val);
        const percent = ((val - 1) * 100).toFixed(2);
        d.pitchVal.textContent = (val >= 1 ? '+' : '') + percent + '%';

        // Update effective BPM
        this.updateEffectiveBPM(id);
      });

      d.bpm.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          this.decks[id].baseBPM = val;
          this.updateEffectiveBPM(id);
        }
      });

      // Mouse Wheel Support for BPM
      d.bpm.addEventListener('wheel', (e) => {
        e.preventDefault();
        const direction = e.deltaY < 0 ? 1 : -1;
        const step = e.shiftKey ? 1.0 : 0.1;
        if (this.decks[id].baseBPM) {
          this.decks[id].baseBPM += direction * step;
          this.updateEffectiveBPM(id);
        }
      }, { passive: false });

      d.upload.addEventListener('click', () => {
        this.pendingDeck = id;
        this.audioUpload.click();
      });

      const vkBtn = document.getElementById(`vk-${id}`);
      if (vkBtn) {
        vkBtn.addEventListener('click', () => {
          const isActive = vkBtn.classList.toggle('active');
          this.engine.setVocalKill(id, isActive);
        });
      }

      // Waveform Seeking (Drag to scrub)
      const handleSeek = (e) => {
        const rect = d.wave.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const audio = this.engine.decks[id].audio;
        if (audio.duration) {
          audio.currentTime = percent * audio.duration;
          // Real-time UI update during scrub
          if (d.progressEl) d.progressEl.style.width = `${percent * 100}%`;
          if (d.timeReadout) {
            const current = this.formatTime(audio.currentTime);
            const total = this.formatTime(audio.duration);
            d.timeReadout.textContent = `${current} / ${total}`;
          }
        }
      };

      d.wave.addEventListener('mousedown', (e) => {
        d.isDraggingWave = true;
        handleSeek(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (d.isDraggingWave) handleSeek(e);
      });

      window.addEventListener('mouseup', () => {
        d.isDraggingWave = false;
      });

      d.wave.addEventListener('touchstart', (e) => {
        d.isDraggingWave = true;
        handleSeek(e);
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (d.isDraggingWave) handleSeek(e);
      }, { passive: true });

      window.addEventListener('touchend', () => {
        d.isDraggingWave = false;
      });
    });

    this.crossfader.addEventListener('input', (e) => {
      this.engine.setCrossfade(parseFloat(e.target.value));
    });

    this.masterGainSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.engine.setMasterGain(val);
      this.masterGainVal.textContent = val.toFixed(1);
    });

    this.masterGainSlider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 0.1 : -0.1;
      const current = parseFloat(this.masterGainSlider.value);
      this.masterGainSlider.value = (current + direction).toFixed(1);
      this.masterGainSlider.dispatchEvent(new Event('input'));
    }, { passive: false });

    this.resetBtn.addEventListener('click', () => {
      this.engine.resetEQ();
      this.updateNodePositionsFromEngine();
      this.updateBandModules();
    });

    this.btnIir.addEventListener('click', () => {
      this.engine.setMode('iir');
      this.btnIir.classList.add('active');
      this.btnFft.classList.remove('active');
    });

    this.btnFft.addEventListener('click', () => {
      this.engine.setMode('fft');
      this.btnFft.classList.add('active');
      this.btnIir.classList.remove('active');
    });

    this.audioUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && this.pendingDeck) {
        const id = this.pendingDeck;
        const d = this.decks[id];
        d.name.textContent = file.name.toUpperCase();
        d.status.textContent = 'DECODING';
        
        // Clear existing waveform immediately
        const timeEl = d.wave.querySelector('.time-readout');
        d.wave.innerHTML = '';
        if (timeEl) d.wave.appendChild(timeEl);

        d.wave.classList.add('loading');
        d.wave.classList.remove('loaded');
        const url = URL.createObjectURL(file);
        this.engine.loadTrack(id, url);
        d.playBtn.disabled = false;
        if (this.engine.ctx.state === 'suspended') this.engine.ctx.resume();
      }
    });

    window.addEventListener('track-loaded', (e) => {
      const { deckId, bpm, buffer } = e.detail;
      const d = this.decks[deckId];
      const deck = this.engine.decks[deckId];
      d.baseBPM = bpm;
      d.bpm.value = bpm;
      d.status.textContent = 'SIGNAL_LOCKED';
      d.wave.classList.remove('loading');
      d.wave.classList.add('loaded');
      
      if (d.timeReadout) {
        const current = this.formatTime(deck.audio.currentTime);
        const total = this.formatTime(deck.audio.duration || buffer.duration);
        d.timeReadout.textContent = `${current} / ${total}`;
      }

      this.drawCyberWaveform(deckId, buffer);
    });

    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    window.addEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  drawCyberWaveform(id, buffer) {
    const container = this.decks[id].wave;
    const timeEl = container.querySelector('.time-readout');
    container.innerHTML = '';

    // Progress Overlay
    const progress = document.createElement('div');
    progress.className = 'wave-progress';
    progress.id = `wave-progress-${id}`;
    container.appendChild(progress);
    this.decks[id].progressEl = progress;

    const canvas = document.createElement('canvas');
    canvas.width = container.clientWidth * 2;
    canvas.height = container.clientHeight * 2;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / (canvas.width / 2));
    const amp = canvas.height / 2;

    // Performance Optimization: Sub-sample the peak detection for large buffers
    const subStep = Math.max(1, Math.floor(step / 60)); // Analyze ~60 points per pixel segment

    ctx.fillStyle = id === 'a' ? this.colors.cyan : this.colors.green;
    for (let i = 0; i < canvas.width; i += 3) {
      let max = 0;
      const startIdx = Math.floor((i / 3) * step);
      for (let j = 0; j < step; j += subStep) {
        const idx = startIdx + j;
        if (idx >= data.length) break;
        const datum = Math.abs(data[idx]);
        if (datum > max) max = datum;
      }
      const h = max * amp * 2.2; // Slightly boosted for better visual presence
      ctx.globalAlpha = 0.8;
      ctx.fillRect(i, (canvas.height - h) / 2, 2, h);
      ctx.globalAlpha = 0.2;
      ctx.fillRect(i, 0, 1, canvas.height); // Background grid lines
    }

    if (timeEl) container.appendChild(timeEl);
  }

  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    let clickedNode = -1;
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const dx = x - node.x, dy = y - node.y;
      if (dx * dx + dy * dy < 625) {
        clickedNode = i;
        break;
      }
    }

    // If we didn't click a node circle, find the band whose width segment we clicked in
    if (clickedNode === -1) {
      let minDist = Infinity;
      for (let i = 0; i < this.nodes.length; i++) {
        const dist = Math.abs(x - this.nodes[i].x);
        if (dist < minDist) {
          minDist = dist;
          clickedNode = i;
        }
      }
    }

    if (clickedNode !== -1) {
      this.activeNodeIndex = clickedNode;
      this.isDragging = true;
      this.canvas.style.cursor = 'grabbing';

      const freq = this.xToFreq(Math.max(0, Math.min(x, this.canvas.width)));
      const gain = this.yToGain(Math.max(0, Math.min(y, this.canvas.height)));
      this.engine.updateBand(this.activeNodeIndex, freq, gain);
      this.updateNodePositionsFromEngine();
      this.updateBandModules();
    }
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    this.mouseX = x;
    this.mouseY = y;

    if (!this.isDragging) {
      let hoveringNode = false;

      // Assign hovered band based on closest X distance (gives each band a responsive width)
      let closestNode = -1;
      let minDist = Infinity;
      for (let i = 0; i < this.nodes.length; i++) {
        const dist = Math.abs(x - this.nodes[i].x);
        if (dist < minDist) {
          minDist = dist;
          closestNode = i;
        }
      }
      this.hoverNodeIndex = closestNode;

      // Check if directly hovering a node circle (overrides cursor state)
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const dx = x - node.x, dy = y - node.y;
        if (dx * dx + dy * dy < 625) {
          hoveringNode = true;
          this.hoverNodeIndex = i;
          break;
        }
      }
      this.canvas.style.cursor = hoveringNode ? 'grab' : 'crosshair';
    }
    if (this.isDragging && this.activeNodeIndex !== -1) {
      const freq = this.xToFreq(Math.max(0, Math.min(x, this.canvas.width)));
      const gain = this.yToGain(Math.max(0, Math.min(y, this.canvas.height)));
      this.engine.updateBand(this.activeNodeIndex, freq, gain);
      this.updateNodePositionsFromEngine();
      this.updateBandModules();
    }
  }

  handleMouseUp() {
    this.isDragging = false;
    this.activeNodeIndex = -1;
    this.hoverNodeIndex = -1;
    this.canvas.style.cursor = 'crosshair';
  }

  handleMouseLeave() {
    this.mouseX = -1;
    this.mouseY = -1;
    this.hoverNodeIndex = -1;
  }

  freqToX(freq) {
    const minF = 20, maxF = 20000;
    return (Math.log10(freq) - Math.log10(minF)) / (Math.log10(maxF) - Math.log10(minF)) * this.canvas.width;
  }

  xToFreq(x) {
    const minF = 20, maxF = 20000;
    const scale = x / this.canvas.width;
    return Math.pow(10, Math.log10(minF) + scale * (Math.log10(maxF) - Math.log10(minF)));
  }

  gainToY(gain) {
    const minG = -24, maxG = 24;
    return this.canvas.height - (((gain - minG) / (maxG - minG)) * this.canvas.height);
  }

  yToGain(y) {
    const minG = -24, maxG = 24;
    return minG + (1 - (y / this.canvas.height)) * (maxG - minG);
  }

  startRenderLoop() {
    const render = () => {
      this.draw();
      this.updateHardwareState();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  updateHardwareState() {
    let totalAmp = 0;
    ['a', 'b'].forEach(id => {
      const deck = this.engine.decks[id];
      const d = this.decks[id];
      const analyzer = id === 'a' ? this.engine.analyserA : this.engine.analyserB;
      const vu = id === 'a' ? this.vuA : this.vuB;

      // VU Meter
      const data = new Float32Array(analyzer.fftSize);
      analyzer.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const level = Math.min(100, Math.sqrt(sum / data.length) * 350);
      totalAmp += level;
      if (level > vu.peak) vu.peak = level; else vu.peak *= 0.94;
      if (vu.fill) vu.fill.style.width = `${vu.peak}%`;

      // Jog & Progress
      if (!deck.audio.paused) {
        d.rotation += 3 * deck.pitch;
        d.jog.style.transform = `rotate(${d.rotation}deg)`;

        const progress = (deck.audio.currentTime / deck.audio.duration) || 0;
        const dashoffset = 534 * (1 - progress);
        d.ring.style.strokeDashoffset = dashoffset;

        if (d.progressEl) {
          d.progressEl.style.width = `${progress * 100}%`;
        }
      }

      if (d.timeReadout && deck.audio.duration) {
        const current = this.formatTime(deck.audio.currentTime);
        const total = this.formatTime(deck.audio.duration);
        d.timeReadout.textContent = `${current} / ${total}`;
      }
    });

    // Reactive Bass
    document.body.style.setProperty('--bass-glow', (totalAmp / 200).toString());

    // Spawn particles on bass hit
    if (totalAmp > 120 && Math.random() > 0.8) {
      for (let i = 0; i < 5; i++) {
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: this.canvas.height,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 6 - 2,
          life: 1.0,
          color: this.colors.cyan
        });
      }
    }
  }

  draw() {
    if (this.canvas.width === 0) return;
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    // 1. Draw Technical Grid
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    this.ctx.lineWidth = 1;
    this.ctx.font = '9px var(--font-mono)';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';

    // Vertical Frequency Lines (Logarithmic)
    const freqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    freqs.forEach(f => {
      const x = this.freqToX(f);
      const isMajor = f === 100 || f === 1000 || f === 10000;

      this.ctx.beginPath();
      this.ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)';
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();

      if (isMajor) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
      } else {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.shadowBlur = 0;
      }

      const label = f >= 1000 ? `${f / 1000}k` : f;
      this.ctx.fillText(label, x + 4, height - 6);
    });

    // Horizontal dB Lines
    const dbs = [-24, -12, 0, 12, 24];
    dbs.forEach(db => {
      const y = this.gainToY(db);
      this.ctx.beginPath();
      this.ctx.setLineDash(db === 0 ? [] : [4, 4]);
      this.ctx.strokeStyle = db === 0 ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)';
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
      this.ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 5, y - 4);
    });
    this.ctx.setLineDash([]);
    this.ctx.restore();

    // 2. Draw Spectrogram Background
    this.ctx.save();

    // Draw Background Band Width Highlight
    const activeIndex = this.isDragging ? this.activeNodeIndex : this.hoverNodeIndex;
    let highlightStartX = -1;
    let highlightEndX = -1;
    let highlightColor = null;

    if (activeIndex !== -1 && activeIndex !== undefined) {
      const sorted = this.nodes.map((n, idx) => ({ x: n.x, color: n.color, idx })).sort((a, b) => a.x - b.x);
      const sortedIdx = sorted.findIndex(n => n.idx === activeIndex);
      if (sortedIdx !== -1) {
        highlightStartX = sortedIdx === 0 ? 0 : (sorted[sortedIdx - 1].x + sorted[sortedIdx].x) / 2;
        highlightEndX = sortedIdx === sorted.length - 1 ? width : (sorted[sortedIdx].x + sorted[sortedIdx + 1].x) / 2;
        highlightColor = sorted[sortedIdx].color;

        this.ctx.fillStyle = `rgba(${this.hexToRgb(highlightColor)}, 0.12)`;
        this.ctx.fillRect(highlightStartX, 0, highlightEndX - highlightStartX, height);
      }
    }

    // Dynamically center persistent cards over their bands
    if (this.bandCards && this.bandCards.length === this.nodes.length) {
      this.nodes.forEach((node, i) => {
        const card = this.bandCards[i];
        if (card) {
          const slFreq = document.getElementById(`sl-freq-${i}`);
          const slGain = document.getElementById(`sl-gain-${i}`);

          // Freeze card position if its slider is actively being dragged
          if (this.activeSlider === slFreq || this.activeSlider === slGain) {
            return;
          }

          const half = 50; // approximate half width
          let x = node.x;
          if (x < half) x = half;
          if (x > width - half) x = width - half;
          card.style.left = `${x}px`;
        }
      });
    }

    // Draw Particles
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      this.ctx.globalAlpha = p.life;
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x, p.y, 2, 2);
    });
    this.ctx.globalAlpha = 1.0;

    const masterData = new Float32Array(this.engine.masterAnalyser.frequencyBinCount);
    this.engine.masterAnalyser.getFloatFrequencyData(masterData);

    // Function to build the waterfall path
    const buildWaterfallPath = () => {
      this.ctx.beginPath();
      let first = true;
      const nyquist = this.engine.ctx.sampleRate / 2;
      let lastX = 0;

      for (let i = 0; i < masterData.length; i++) {
        const freq = i * nyquist / masterData.length;
        if (freq < 20 || freq > 20000) continue;

        const x = this.freqToX(freq);
        const normalized = Math.max(0, (masterData[i] + 100) / 100);
        const y = height - (normalized * height * 0.8);

        if (first) {
          this.ctx.moveTo(x, y);
          first = false;
        } else {
          this.ctx.lineTo(x, y);
        }
        lastX = x;
      }
      return lastX;
    };

    // 1. Draw Base Spectrogram (Cyan)
    let lastX = buildWaterfallPath();
    this.ctx.strokeStyle = this.colors.cyan;
    this.ctx.lineWidth = 2;
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = this.colors.cyan;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    const baseGrad = this.ctx.createLinearGradient(0, height, 0, 0);
    baseGrad.addColorStop(0, `rgba(${this.hexToRgb(this.colors.cyan)}, 0)`);
    baseGrad.addColorStop(1, `rgba(${this.hexToRgb(this.colors.cyan)}, 0.25)`);
    this.ctx.fillStyle = baseGrad;
    this.ctx.lineTo(lastX, height);
    this.ctx.lineTo(0, height);
    this.ctx.fill();

    // 2. Draw Highlighted Section using Clip
    if (highlightColor) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(highlightStartX, 0, highlightEndX - highlightStartX, height);
      this.ctx.clip();

      lastX = buildWaterfallPath();
      this.ctx.strokeStyle = highlightColor;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = highlightColor;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      const hiGrad = this.ctx.createLinearGradient(0, height, 0, 0);
      hiGrad.addColorStop(0, `rgba(${this.hexToRgb(highlightColor)}, 0)`);
      hiGrad.addColorStop(1, `rgba(${this.hexToRgb(highlightColor)}, 0.25)`);
      this.ctx.fillStyle = hiGrad;
      this.ctx.lineTo(lastX, height);
      this.ctx.lineTo(0, height);
      this.ctx.fill();

      this.ctx.restore();
    }
    this.ctx.restore();

    // 2.5 Add Oscilloscope Scanline Texture
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'overlay';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < height; i += 4) {
      this.ctx.fillRect(0, i, width, 1);
    }
    this.ctx.restore();

    // 2.6 Draw Technical Crosshair
    if (this.mouseX !== -1 && this.mouseY !== -1 && !this.isDragging) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      this.ctx.setLineDash([2, 4]);
      this.ctx.lineWidth = 1;

      this.ctx.beginPath();
      this.ctx.moveTo(0, this.mouseY); this.ctx.lineTo(width, this.mouseY);
      this.ctx.moveTo(this.mouseX, 0); this.ctx.lineTo(this.mouseX, height);
      this.ctx.stroke();

      const fRead = Math.round(this.xToFreq(this.mouseX));
      const gRead = this.yToGain(this.mouseY).toFixed(1);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.font = '10px var(--font-mono)';
      this.ctx.fillText(`${fRead}Hz | ${gRead}dB`, this.mouseX + 8, this.mouseY - 8);
      this.ctx.restore();
    }

    // 3. Draw Frequency Response Curve with Fill
    const fillPath = new Path2D();
    fillPath.moveTo(0, height);
    for (let x = 0; x < width; x++) {
      const freq = this.xToFreq(x);
      const mag = this.engine.getFrequencyResponse(freq);
      const y = this.gainToY(mag);
      fillPath.lineTo(x, y);
    }
    fillPath.lineTo(width, height);
    fillPath.closePath();

    const areaGrad = this.ctx.createLinearGradient(0, 0, 0, height);
    areaGrad.addColorStop(0, 'rgba(0, 242, 255, 0.12)');
    areaGrad.addColorStop(1, 'rgba(0, 242, 255, 0)');
    this.ctx.fillStyle = areaGrad;
    this.ctx.fill(fillPath);

    // Draw Main Curve Line
    this.ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const freq = this.xToFreq(x);
      const mag = this.engine.getFrequencyResponse(freq);
      const y = this.gainToY(mag);
      if (x === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.strokeStyle = 'var(--accent-cyan)';
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = 'var(--accent-cyan)';
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    this.drawNodes();
  }

  drawEqCurve() {
    const { width, height } = this.canvas;
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([15, 15]);
    const numPoints = 150;
    for (let i = 0; i <= numPoints; i++) {
      const x = (i / numPoints) * width;
      const freq = this.xToFreq(x);
      let totalMag = 1.0;
      const f = new Float32Array([freq]), m = new Float32Array(1), p = new Float32Array(1);
      for (const node of this.engine.iirNodes) {
        node.getFrequencyResponse(f, m, p);
        totalMag *= m[0];
      }
      const y = this.gainToY(20 * Math.log10(Math.max(0.0001, totalMag)));
      if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  drawNodes() {
    this.nodes.forEach((node, i) => {
      const active = i === this.activeNodeIndex || (!this.isDragging && i === this.hoverNodeIndex);

      // Node Pulse
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, active ? 25 : 15, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${this.hexToRgb(node.color)}, ${active ? 0.3 : 0.1})`;
      this.ctx.fill();

      // Node Inner
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, active ? 12 : 8, 0, Math.PI * 2);
      this.ctx.fillStyle = node.color;
      this.ctx.shadowBlur = active ? 40 : 20;
      this.ctx.shadowColor = node.color;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();

      // ID Label
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 11px Outfit, sans-serif';
      this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
      this.ctx.fillText((i + 1).toString(), node.x, node.y);
    });
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 255, 255';
  }
}
