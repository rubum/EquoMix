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

    this.stackedCanvas = document.getElementById('stacked-waveforms-canvas');
    if (this.stackedCanvas) {
      this.stackedCtx = this.stackedCanvas.getContext('2d');
    }

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

    // Master Hub
    this.masterVuL = document.getElementById('master-vu-l');
    this.masterVuR = document.getElementById('master-vu-r');
    this.masterGainKnob = document.getElementById('master-gain');
    this.masterVuPeak = 0;

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

    // Library state
    this.libraryTracks = [];

    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.resizeStackedCanvas();
    });
    this.setupEventListeners();
    this.createBandModules();
    this.setupTabs();
    this.setupLibrary();
    this.setupResizer();

    // Initial Layout Priority
    const decks = document.querySelector('.decks-grid');
    if (decks) {
      decks.style.flex = 'none';
      decks.style.height = '400px'; // Set a focused default height
    }

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
    const d = {
      playBtn: document.getElementById(`play-${id}`),
      cueBtn: document.getElementById(`cue-${id}`),
      syncBtn: document.getElementById(`sync-${id}`),
      cupBtn: document.getElementById(`cup-${id}`),
      name: document.getElementById(`name-${id}`),
      bpm: document.getElementById(`bpm-readout-${id}`),
      key: document.getElementById(`key-readout-${id}`),
      pitch: document.getElementById(`pitch-${id}`),
      pitchVal: document.getElementById(`pitch-val-${id}`),
      waveMain: document.getElementById(`wave-main-${id}`),
      waveStrip: document.getElementById(`wave-strip-${id}`),
      stripProgress: document.getElementById(`strip-progress-${id}`),
      timeReadout: document.getElementById(`time-${id}`),
      timeRem: document.getElementById(`time-rem-${id}`),
      jog: document.getElementById(`jog-${id}`),
      vkBtn: document.getElementById(`vk-${id}`),
      rotation: 0,
      upload: document.querySelector(`.upload-btn[data-deck="${id}"]`),
      // Internal state for waveform scrolling
      mainCanvas: null,
      stripCanvas: null,
      waveformBuffer: null,
      cuePoint: 0
    };
    return d;
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

  resizeStackedCanvas() {
    if (!this.stackedCanvas) return;
    const parent = this.stackedCanvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width === 0) {
      setTimeout(() => this.resizeStackedCanvas(), 100);
      return;
    }
    this.stackedCanvas.width = rect.width;
    this.stackedCanvas.height = rect.height;
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
      this.attachWheelSupport(el, el.classList.contains('freq-slider') ? 10 : 2);
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

  attachWheelSupport(slider, multiplier = 1) {
    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = parseFloat(slider.step) || 1;
      const direction = e.deltaY > 0 ? -1 : 1;
      const delta = step * direction * multiplier;

      const newVal = parseFloat(slider.value) + delta;
      slider.value = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), newVal));

      // Manually trigger input event
      slider.dispatchEvent(new Event('input'));
      slider.dispatchEvent(new Event('change'));
    }, { passive: false });
  }

  setupEventListeners() {
    ['a', 'b'].forEach(id => {
      const d = this.decks[id];
      const deck = this.engine.decks[id];

      d.playBtn.addEventListener('click', () => {
        if (deck.audio.paused) {
          if (this.engine.ctx.state === 'suspended') this.engine.ctx.resume();
          deck.audio.play();
          d.playBtn.classList.add('active');
          d.playBtn.textContent = '||';
        } else {
          deck.audio.pause();
          d.playBtn.classList.remove('active');
          d.playBtn.textContent = '▶';
        }
      });

      // CUE Logic
      d.cueBtn.addEventListener('mousedown', () => {
        if (deck.audio.paused) {
          if (Math.abs(deck.audio.currentTime - d.cuePoint) < 0.1) {
            // Stutter play
            if (this.engine.ctx.state === 'suspended') this.engine.ctx.resume();
            deck.audio.play();
            d.cueBtn.classList.add('active');
          } else {
            // Set new cue point
            d.cuePoint = deck.audio.currentTime;
            d.cueBtn.classList.add('active');
            setTimeout(() => d.cueBtn.classList.remove('active'), 100);
          }
        } else {
          // Playing -> Pause and jump to cue
          deck.audio.pause();
          deck.audio.currentTime = d.cuePoint;
          d.playBtn.classList.remove('active');
          d.playBtn.textContent = '▶';
          d.cueBtn.classList.add('active');
          setTimeout(() => d.cueBtn.classList.remove('active'), 100);
        }
      });

      d.cueBtn.addEventListener('mouseup', () => {
        if (!deck.audio.paused && d.cueBtn.classList.contains('active')) {
          // End of stutter play
          deck.audio.pause();
          deck.audio.currentTime = d.cuePoint;
          d.cueBtn.classList.remove('active');
        }
      });

      // CUP Logic
      d.cupBtn.addEventListener('click', () => {
        deck.audio.currentTime = d.cuePoint;
        if (this.engine.ctx.state === 'suspended') this.engine.ctx.resume();
        deck.audio.play();
        d.playBtn.classList.add('active');
        d.playBtn.textContent = '||';

        d.cupBtn.classList.add('active');
        setTimeout(() => d.cupBtn.classList.remove('active'), 100);
      });

      // SYNC Logic
      d.syncBtn.addEventListener('click', () => {
        const otherId = id === 'a' ? 'b' : 'a';
        const otherDeck = this.decks[otherId];

        if (!d.baseBPM || !otherDeck.baseBPM || d.baseBPM === '---' || otherDeck.baseBPM === '---') return;

        const otherPitch = this.engine.decks[otherId].pitch;
        const targetBPM = otherDeck.baseBPM * otherPitch;
        const requiredPitch = targetBPM / d.baseBPM;
        const clampedPitch = Math.min(1.1, Math.max(0.9, requiredPitch));

        d.pitch.value = clampedPitch;
        this.engine.setPitch(id, clampedPitch);
        this.updateEffectiveBPM(id);
        d.pitchVal.textContent = (clampedPitch >= 1 ? '+' : '') + `${((clampedPitch - 1) * 100).toFixed(1)}%`;

        d.syncBtn.classList.add('active');
        setTimeout(() => d.syncBtn.classList.remove('active'), 200);
      });

      d.pitch.addEventListener('input', (e) => {
        this.engine.setPitch(id, parseFloat(e.target.value));
        this.updateEffectiveBPM(id);
        d.pitchVal.textContent = `${((parseFloat(e.target.value) - 1) * 100).toFixed(1)}%`;
      });
      this.attachWheelSupport(d.pitch, 1);

      d.upload.addEventListener('click', () => {
        this.pendingDeck = id;
        this.audioUpload.click();
      });

      if (d.vkBtn) {
        d.vkBtn.addEventListener('click', () => {
          const isActive = d.vkBtn.classList.toggle('active');
          this.engine.setVocalKill(id, isActive);
        });
      }

      // Strip Seeking
      const handleSeek = (e) => {
        const rect = d.waveStrip.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        if (deck.audio.duration) {
          deck.audio.currentTime = percent * deck.audio.duration;
        }
      };

      d.waveStrip.addEventListener('mousedown', (e) => {
        d.isDraggingStrip = true;
        handleSeek(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (d.isDraggingStrip) handleSeek(e);
      });

      window.addEventListener('mouseup', () => {
        d.isDraggingStrip = false;
      });
    });

    // Master Gain
    this.masterGainSlider = document.getElementById('master-gain-slider');
    if (this.masterGainSlider) {
      this.attachWheelSupport(this.masterGainSlider, 5);
      this.masterGainSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.engine.setMasterGain(val);
        if (this.masterGainVal) this.masterGainVal.textContent = val.toFixed(1);
      });
    }

    // Crossfader
    this.crossfader = document.getElementById('crossfader');
    if (this.crossfader) {
      this.attachWheelSupport(this.crossfader, 2);
      this.crossfader.addEventListener('input', (e) => {
        this.engine.setCrossfade(parseFloat(e.target.value));
      });
    }

    // EQ Modes
    const modeAnalog = document.getElementById('mode-analog');
    const modeSpectral = document.getElementById('mode-spectral');
    if (modeAnalog && modeSpectral) {
      modeAnalog.addEventListener('click', () => {
        modeAnalog.classList.add('active');
        modeSpectral.classList.remove('active');
        this.engine.setMode('iir');
      });
      modeSpectral.addEventListener('click', () => {
        modeSpectral.classList.add('active');
        modeAnalog.classList.remove('active');
        this.engine.setMode('fft');
      });
    }

    // Utility Toggles
    ['btn-snap', 'btn-quant'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
        });
      }
    });

    this.resetBtn.addEventListener('click', () => {
      this.engine.resetEQ();
      this.updateNodePositionsFromEngine();
      this.updateBandModules();
    });

    this.audioUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && this.pendingDeck) {
        const id = this.pendingDeck;
        const d = this.decks[id];
        d.name.textContent = file.name.toUpperCase();

        // Start Loading Animation
        const waveforms = d.waveMain.parentElement;
        if (waveforms) waveforms.classList.add('loading');

        // Pass to Engine
        this.engine.loadTrack(id, URL.createObjectURL(file));
        d.playBtn.disabled = false;

        if (this.engine.ctx.state === 'suspended') {
          this.engine.ctx.resume();
        }
      }
    });

    window.addEventListener('track-loaded', (e) => {
      const { deckId, bpm, buffer } = e.detail;
      const d = this.decks[deckId];
      const deck = this.engine.decks[deckId];
      d.baseBPM = bpm;
      d.bpm.textContent = `${bpm} BPM`;

      this.drawCyberWaveform(deckId, buffer);

      // Stop Loading Animation
      const waveforms = d.waveMain.parentElement;
      if (waveforms) waveforms.classList.remove('loading');
    });

    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    window.addEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  setupResizer() {
    const resizer = document.getElementById('stage-resizer');
    const decks = document.querySelector('.decks-grid');
    const console = document.querySelector('.master-console');
    const stage = document.querySelector('.stage');

    if (!resizer || !decks || !console || !stage) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const stageRect = stage.getBoundingClientRect();
      const relativeY = e.clientY - stageRect.top;

      // Constraints: Min height for decks and console
      const minDecks = 220;
      const minConsole = 250;

      let decksHeight = relativeY;
      if (decksHeight < minDecks) decksHeight = minDecks;
      if (stageRect.height - decksHeight < minConsole) decksHeight = stageRect.height - minConsole;

      decks.style.flex = 'none';
      decks.style.height = `${decksHeight}px`;

      // Ensure canvas resize triggers
      this.resizeCanvas();
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
        this.resizeCanvas();
      }
    });
  }

  setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    this.activeMasterTab = 'pane-analyzer';

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.getAttribute('data-target');
        const pane = document.getElementById(targetId);
        if (pane) pane.classList.add('active');
        
        this.activeMasterTab = targetId;

        // Toggle visibility of Reset All Bands button
        const resetBtn = document.getElementById('reset-eq');
        if (resetBtn) {
          resetBtn.style.display = targetId === 'pane-analyzer' ? 'block' : 'none';
        }
        
        // Resize canvases when switching tabs
        if (targetId === 'pane-analyzer') this.resizeCanvas();
        if (targetId === 'pane-waveforms') this.resizeStackedCanvas();
      });
    });
  }

  setupLibrary() {
    const libLinkBtn = document.getElementById('lib-link-btn');
    const libAddBtn = document.getElementById('lib-add-btn');
    const libUpload = document.getElementById('lib-upload');
    const libFolderUpload = document.getElementById('lib-folder-upload');
    const libList = document.getElementById('lib-list');
    const libSearch = document.getElementById('lib-search');

    if (!libAddBtn || !libUpload || !libList || !libFolderUpload) return;

    libAddBtn.addEventListener('click', () => libUpload.click());
    libLinkBtn.addEventListener('click', () => libFolderUpload.click());

    libFolderUpload.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        // Only process audio files from the selected directory
        if (file.type.startsWith('audio/')) {
          this.addFileToLibrary(file);
        }
      }

      this.renderLibrary();
      libFolderUpload.value = '';
    });

    libUpload.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        this.addFileToLibrary(file);
      }

      this.renderLibrary();
      libUpload.value = '';
    });

    libSearch.addEventListener('input', (e) => {
      this.renderLibrary(e.target.value);
    });
  }

  addFileToLibrary(file) {
    // Create a local object URL
    const url = URL.createObjectURL(file);

    // Parse Artist/Title from filename
    const rawName = file.name.replace(/\.[^/.]+$/, ""); // strip extension
    let artist = "UNKNOWN ARTIST";
    let title = rawName;

    if (rawName.includes(' - ')) {
      const parts = rawName.split(' - ');
      artist = parts[0].trim();
      title = parts[1].trim();
    }

    // Mock Key (Camelot)
    const keys = ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A', '1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '10B', '11B', '12B'];
    const randomKey = keys[Math.floor(Math.random() * keys.length)];

    // Mock Rating (dots)
    const rating = Math.floor(Math.random() * 5) + 1;

    // Mock Art Color
    const hue = Math.floor(Math.random() * 360);
    const artColor = `hsl(${hue}, 40%, 30%)`;

    // Push to library state
    this.libraryTracks.push({
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      artist,
      title,
      url,
      bpm: '---',
      key: randomKey,
      rating,
      artColor
    });
  }

  renderLibrary(filterQuery = '') {
    const libList = document.getElementById('lib-list');
    if (!libList) return;

    if (this.libraryTracks.length === 0) {
      libList.innerHTML = '<div class="lib-empty">COLLECTION IS EMPTY. IMPORT MEDIA TO BEGIN.</div>';
      return;
    }

    const q = filterQuery.toLowerCase();
    const filtered = this.libraryTracks.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      libList.innerHTML = '<div class="lib-empty">NO TRACKS MATCH YOUR SEARCH.</div>';
      return;
    }

    libList.innerHTML = filtered.map((track, idx) => `
      <div class="lib-track-row" data-id="${track.id}">
        <div class="l-col l-index">${idx + 1}</div>
        <div class="l-col l-cover">
          <div class="track-audio-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;">
              <path d="M12 2v20M2 10v4M22 10v4M7 7v10M17 7v10" />
            </svg>
          </div>
        </div>
        <div class="l-col l-title" title="${track.title}">${track.title}</div>
        <div class="l-col l-artist" title="${track.artist}">${track.artist}</div>
        <div class="l-col l-bpm">${track.bpm}</div>
        <div class="l-col l-key">${track.key}</div>
        <div class="l-col l-rating">
          <span class="rating-dots">${'●'.repeat(track.rating)}${'○'.repeat(5 - track.rating)}</span>
        </div>
        <div class="l-col l-act">
          <button class="load-btn deck-a" data-id="${track.id}" data-deck="a">LOAD A</button>
          <button class="load-btn deck-b" data-id="${track.id}" data-deck="b">LOAD B</button>
        </div>
      </div>
    `).join('');

    // Attach load events
    libList.querySelectorAll('.load-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = e.target.getAttribute('data-id');
        const deckId = e.target.getAttribute('data-deck');
        this.loadLibraryTrackToDeck(trackId, deckId);
      });
    });

    // Row selection aesthetic
    libList.querySelectorAll('.lib-track-row').forEach(row => {
      row.addEventListener('click', () => {
        libList.querySelectorAll('.lib-track-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
      });
    });
  }

  loadLibraryTrackToDeck(trackId, deckId) {
    const track = this.libraryTracks.find(t => t.id === trackId);
    if (!track) return;

    const d = this.decks[deckId];

    // UI Updates
    d.name.textContent = track.name.toUpperCase();
    if (d.bpm) d.bpm.textContent = `${track.bpm} BPM`;
    if (d.key) d.key.textContent = track.key;

    // Start Loading Animation
    const waveforms = d.waveMain.parentElement;
    if (waveforms) waveforms.classList.add('loading');

    // Clear existing waveform containers
    if (d.waveMain) d.waveMain.innerHTML = '<div class="playhead"></div>';
    if (d.waveStrip) d.waveStrip.innerHTML = '';

    // Pass to Engine
    this.engine.loadTrack(deckId, track.url);
    d.playBtn.disabled = false;

    if (this.engine.ctx.state === 'suspended') {
      this.engine.ctx.resume();
    }
  }

  drawCyberWaveform(id, buffer) {
    const d = this.decks[id];
    d.waveformBuffer = buffer.getChannelData(0);

    // 1. Setup Overview Strip
    d.waveStrip.innerHTML = '<div class="strip-progress" id="strip-progress-' + id + '"></div>';
    d.stripProgress = d.waveStrip.querySelector('.strip-progress');

    const sCanvas = document.createElement('canvas');
    sCanvas.width = d.waveStrip.clientWidth * 2;
    sCanvas.height = d.waveStrip.clientHeight * 2;
    sCanvas.style.width = '100%';
    sCanvas.style.height = '100%';
    d.waveStrip.appendChild(sCanvas);

    const sCtx = sCanvas.getContext('2d');
    const data = d.waveformBuffer;
    const step = Math.ceil(data.length / sCanvas.width);
    const amp = sCanvas.height / 2;

    sCtx.fillStyle = id === 'a' ? '#3498db' : '#e67e22';
    for (let i = 0; i < sCanvas.width; i++) {
      let max = 0;
      for (let j = 0; j < step; j += 10) {
        const datum = Math.abs(data[i * step + j]);
        if (datum > max) max = datum;
      }
      sCtx.fillRect(i, amp - (max * amp), 1, max * amp * 2);
    }

    // 2. Setup Main Scrolling Waveform
    d.waveMain.innerHTML = '<div class="playhead"></div>';
    const mCanvas = document.createElement('canvas');
    mCanvas.width = d.waveMain.clientWidth * 2;
    mCanvas.height = d.waveMain.clientHeight * 2;
    mCanvas.style.width = '100%';
    mCanvas.style.height = '100%';
    d.waveMain.appendChild(mCanvas);
    d.mainCanvas = mCanvas;
  }

  drawWaveformSlice(id) {
    const d = this.decks[id];
    if (!d.waveformBuffer || !d.mainCanvas) return;

    const deck = this.engine.decks[id];
    const ctx = d.mainCanvas.getContext('2d');
    const width = d.mainCanvas.width;
    const height = d.mainCanvas.height;
    const buffer = d.waveformBuffer;

    ctx.clearRect(0, 0, width, height);

    // Zoom level (samples visible) - 40,000 is a good "pro" look
    const zoom = 40000;
    const currentSample = deck.audio.currentTime * 44100;
    const startSample = currentSample - zoom / 2;

    const amp = height / 2;
    const step = zoom / width;

    for (let i = 0; i < width; i++) {
      const idx = Math.floor(startSample + i * step);
      if (idx >= 0 && idx < buffer.length) {
        const val = Math.abs(buffer[idx]);
        const h = val * amp * 2.5; // Boosted for impact

        // Spectral Color Logic
        ctx.fillStyle = this.getSpectralColor(val, id);
        ctx.fillRect(i, amp - h / 2, 1, h);
      }
    }
  }

  getSpectralColor(val, deckId) {
    // Premium Spectral Mapping
    // Low Amp: Deep Blue/Orange -> High Amp: Bright Cyan/Amber -> Peak: White
    if (deckId === 'a') {
      if (val > 0.8) return '#ffffff';
      if (val > 0.4) return '#00d2ff';
      return '#004a8f';
    } else {
      if (val > 0.8) return '#ffffff';
      if (val > 0.4) return '#ff9500';
      return '#8f4a00';
    }
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
      if (this.activeMasterTab === 'pane-analyzer') {
        this.draw();
      } else if (this.activeMasterTab === 'pane-waveforms') {
        this.drawStackedWaveforms();
      }
      this.updateHardwareState();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  drawStackedWaveforms() {
    if (!this.stackedCanvas || !this.stackedCtx) return;
    const ctx = this.stackedCtx;
    const width = this.stackedCanvas.width;
    const height = this.stackedCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const halfHeight = height / 2;

    // Helper to draw a single scrolling deck waveform
    const drawDeck = (id, yOffset, color) => {
      const d = this.decks[id];
      const deck = this.engine.decks[id];
      if (!d.waveformBuffer) return;

      const buffer = d.waveformBuffer;
      const duration = deck.audio.duration || 1;
      const currentTime = deck.audio.currentTime || 0;

      // Window size: how many seconds of audio fit on screen
      const windowSec = 4; // 2 seconds before center playhead, 2 seconds after
      const samplesPerSec = buffer.length / duration;
      const samplesInWindow = samplesPerSec * windowSec;

      const playheadSample = Math.floor((currentTime / duration) * buffer.length);
      const startSample = Math.floor(playheadSample - (samplesInWindow / 2));
      const step = Math.max(1, Math.floor(samplesInWindow / width));

      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.beginPath();

      const amp = halfHeight / 2;
      const centerY = yOffset + amp;

      for (let i = 0; i < width; i++) {
        const sampleIdx = startSample + i * step;
        if (sampleIdx >= 0 && sampleIdx < buffer.length) {
          // Find peak in chunk
          let max = 0;
          for (let j = 0; j < step; j += 10) {
            const idx = sampleIdx + j;
            if (idx < buffer.length) {
              const val = Math.abs(buffer[idx]);
              if (val > max) max = val;
            }
          }
          ctx.moveTo(i, centerY - (max * amp));
          ctx.lineTo(i, centerY + (max * amp));
        }
      }
      ctx.stroke();
    };

    drawDeck('a', 0, '#3498db'); // Top half, Blue
    drawDeck('b', halfHeight, '#00df9a'); // Bottom half, Mint
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

      // Waveform Rendering & Progress
      if (!deck.audio.paused || d.isDraggingStrip) {
        if (!deck.audio.paused) {
          d.rotation += 3 * deck.pitch;
          d.jog.style.transform = `rotate(${d.rotation}deg)`;
        }

        // Draw the scrolling waveform slice
        this.drawWaveformSlice(id);

        const progress = (deck.audio.currentTime / deck.audio.duration) || 0;
        if (d.stripProgress) {
          d.stripProgress.style.width = `${progress * 100}%`;
        }
      }

      if (d.timeReadout && deck.audio.duration) {
        const current = deck.audio.currentTime;
        const total = deck.audio.duration;
        const remaining = total - current;

        d.timeReadout.textContent = this.formatTimeShort(current);
        if (d.timeRem) {
          d.timeRem.textContent = "-" + this.formatTimeShort(remaining);
        }
      }
    });

    // Reactive Bass
    document.body.style.setProperty('--bass-glow', (totalAmp / 200).toString());

    // Master VU Metering
    const masterLevel = Math.min(100, totalAmp / 2);
    if (masterLevel > this.masterVuPeak) this.masterVuPeak = masterLevel; else this.masterVuPeak *= 0.94;
    if (this.masterVuL) this.masterVuL.style.height = `${this.masterVuPeak}%`;
    if (this.masterVuR) this.masterVuR.style.height = `${this.masterVuPeak * 0.98}%`; // Slight offset for realism

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

  formatTimeShort(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
    const dataA = new Float32Array(this.engine.analyserA.frequencyBinCount);
    this.engine.analyserA.getFloatFrequencyData(dataA);

    const dataB = new Float32Array(this.engine.analyserB.frequencyBinCount);
    this.engine.analyserB.getFloatFrequencyData(dataB);

    this.ctx.globalCompositeOperation = 'lighter';

    const drawCurve = (data, color, fillOpacity) => {
      this.ctx.beginPath();
      let first = true;
      const nyquist = this.engine.ctx.sampleRate / 2;
      let lastX = 0;

      for (let i = 0; i < data.length; i++) {
        const freq = i * nyquist / data.length;
        if (freq < 20 || freq > 20000) continue;

        const x = this.freqToX(freq);
        const normalized = Math.max(0, (data[i] + 100) / 100);
        const y = height - (normalized * height * 0.8);

        if (first) {
          this.ctx.moveTo(x, y);
          first = false;
        } else {
          this.ctx.lineTo(x, y);
        }
        lastX = x;
      }
      
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = color;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      const baseGrad = this.ctx.createLinearGradient(0, height, 0, 0);
      baseGrad.addColorStop(0, `rgba(${this.hexToRgb(color)}, 0)`);
      baseGrad.addColorStop(1, `rgba(${this.hexToRgb(color)}, ${fillOpacity})`);
      this.ctx.fillStyle = baseGrad;
      this.ctx.lineTo(lastX, height);
      this.ctx.lineTo(this.freqToX(20), height);
      this.ctx.closePath();
      this.ctx.fill();
    };

    // Draw Deck A (Blue) and Deck B (Mint/Orange)
    drawCurve(dataA, '#3498db', 0.25);
    drawCurve(dataB, '#00df9a', 0.25);
    
    this.ctx.globalCompositeOperation = 'source-over';

    // 2. Draw Highlighted Section using Clip
    if (highlightColor) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(highlightStartX, 0, highlightEndX - highlightStartX, height);
      this.ctx.clip();

      const masterData = new Float32Array(this.engine.masterAnalyser.frequencyBinCount);
      this.engine.masterAnalyser.getFloatFrequencyData(masterData);

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
      this.ctx.lineTo(this.freqToX(20), height);
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
      const { width, height } = this.canvas;

      // Crosshair Lines
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.setLineDash([2, 4]);
      this.ctx.strokeStyle = `rgba(${this.hexToRgb(node.color)}, ${active ? 0.4 : 0.15})`;
      this.ctx.lineWidth = 1;
      // Horizontal
      this.ctx.moveTo(0, node.y);
      this.ctx.lineTo(width, node.y);
      // Vertical
      this.ctx.moveTo(node.x, 0);
      this.ctx.lineTo(node.x, height);
      this.ctx.stroke();
      this.ctx.restore();

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
