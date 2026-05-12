import FFT from 'fft.js';

/**
 * Generates an impulse response for a linear phase EQ using IFFT.
 * 
 * This function takes a desired magnitude frequency response and computes a 
 * symmetric, causal impulse response that can be used with a ConvolverNode.
 * Because the response is symmetric, it maintains linear phase (constant group delay).
 * 
 * @param {Float32Array} magnitudes - The desired frequency response magnitudes (linear scale). 
 *                                    Length should be N/2.
 * @param {number} N - The FFT size (must be a power of 2, e.g., 4096 or 8192).
 * @returns {Float32Array} - The causal, windowed impulse response of length N.
 */
export function generateLinearPhaseImpulseResponse(magnitudes, N) {
  const fft = new FFT(N);
  const complexSpectrum = fft.createComplexArray();

  // Create a hermitian symmetric spectrum for a real-valued impulse response
  // Index 0 is DC, Index N is Nyquist
  complexSpectrum[0] = magnitudes[0];
  complexSpectrum[1] = 0;

  complexSpectrum[N] = magnitudes[magnitudes.length - 1];
  complexSpectrum[N + 1] = 0;

  for (let i = 1; i < N / 2; i++) {
    const mag = magnitudes[i];
    // Positive frequencies
    complexSpectrum[i * 2] = mag; 
    complexSpectrum[i * 2 + 1] = 0; 

    // Negative frequencies (mirrored for real IR)
    complexSpectrum[(N - i) * 2] = mag;
    complexSpectrum[(N - i) * 2 + 1] = 0;
  }

  // Perform Inverse Fast Fourier Transform (IFFT)
  const impulseResponseZeroPhase = fft.createComplexArray();
  fft.inverseTransform(impulseResponseZeroPhase, complexSpectrum);

  const impulseResponseReal = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // Extract real part from complex output
    impulseResponseReal[i] = impulseResponseZeroPhase[i * 2]; 
  }

  // Shift by N/2 (circular shift) to center the impulse and make it causal.
  // This introduces a latency of (N/2) / sampleRate seconds.
  const causalIR = new Float32Array(N);
  const halfN = N / 2;
  for (let i = 0; i < N; i++) {
    causalIR[i] = impulseResponseReal[(i + halfN) % N];
  }

  // Apply a Blackman window to the impulse response.
  // This reduces spectral leakage (ringing) caused by the finite length of the IR.
  for (let i = 0; i < N; i++) {
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
    causalIR[i] *= w;
  }

  return causalIR;
}

/**
 * Converts a value from decibels (dB) to a linear gain factor.
 * 
 * @param {number} db - The value in decibels.
 * @returns {number} - The linear gain factor (e.g., 0dB -> 1.0, -6dB -> 0.5).
 */
export function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * Evaluates the frequency magnitude response of a single Biquad filter at specified frequencies.
 * 
 * @param {AudioContext} ctx - The active AudioContext.
 * @param {BiquadFilterNode} filter - The filter node to analyze.
 * @param {Float32Array} freqs - An array of frequencies (in Hz) to evaluate.
 * @returns {Float32Array} - An array of linear magnitude responses.
 */
export function getBiquadResponse(ctx, filter, freqs) {
  const magResponse = new Float32Array(freqs.length);
  const phaseResponse = new Float32Array(freqs.length);
  filter.getFrequencyResponse(freqs, magResponse, phaseResponse);
  return magResponse;
}
