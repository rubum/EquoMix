import { AudioEngine } from './audioEngine.js';
import { UIController } from './uiController.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Engine
  const engine = new AudioEngine();
  
  // Initialize UI
  const ui = new UIController(engine);

  // Resume context on first user interaction if suspended
  const resumeContext = () => {
    if (engine.ctx.state === 'suspended') {
      engine.ctx.resume();
    }
    document.removeEventListener('click', resumeContext);
    document.removeEventListener('touchstart', resumeContext);
  };
  
  document.addEventListener('click', resumeContext);
  document.addEventListener('touchstart', resumeContext);
});
