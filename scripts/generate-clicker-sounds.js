// Generate WAV files for the virtual clicker and whistle.
// Run once to produce assets/sounds/click.wav and assets/sounds/whistle.wav.
// No external dependencies — writes WAV bytes directly.
//
// Usage: node scripts/generate-clicker-sounds.js

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050; // Hz — plenty for short tones, half the file size of 44.1kHz
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;     // mono — clicker doesn't need stereo

const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Build a valid WAV file Buffer from an array of int16 samples.
 * WAV format reference: http://soundfile.sapp.org/doc/WaveFormat/
 */
function buildWav(samples) {
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE / 8;
  const blockAlign = NUM_CHANNELS * BITS_PER_SAMPLE / 8;
  const dataSize = samples.length * 2; // int16 = 2 bytes
  const buf = Buffer.alloc(44 + dataSize);

  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);

  // fmt subchunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);             // subchunk1 size (PCM)
  buf.writeUInt16LE(1, 20);              // audio format = PCM
  buf.writeUInt16LE(NUM_CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data subchunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buf;
}

/**
 * Clip a float in [-1, 1] to int16 range.
 */
function toInt16(v) {
  return Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
}

// ─── Click sound ─────────────────────────────────────────────────────────────
// Sharp ~50ms transient — sine wave at 3000Hz with exponential decay.
// The fast decay envelope makes it sound like a real "tic" rather than a beep.
function generateClick() {
  const durationSec = 0.05;  // 50ms
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const freq = 3000;
  const decay = 90;          // higher = faster decay (sharper "tic")
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-decay * t);
    const wave = Math.sin(2 * Math.PI * freq * t);
    samples[i] = toInt16(wave * envelope * 0.9); // 0.9 = headroom against clipping
  }
  return samples;
}

// ─── Whistle sound ───────────────────────────────────────────────────────────
// 800ms sustained tone at 4000Hz with smooth attack and release envelopes
// (avoids harsh clicks at start/end). A slight vibrato adds realism.
function generateWhistle() {
  const durationSec = 0.8;   // 800ms
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const freq = 4000;
  const vibratoFreq = 6;     // 6Hz vibrato (subtle)
  const vibratoDepth = 30;   // ±30Hz pitch modulation
  const attackSec = 0.05;
  const releaseSec = 0.1;
  const attackSamples = Math.floor(SAMPLE_RATE * attackSec);
  const releaseSamples = Math.floor(SAMPLE_RATE * releaseSec);
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Pitch with vibrato for natural whistle feel
    const instFreq = freq + vibratoDepth * Math.sin(2 * Math.PI * vibratoFreq * t);
    // We integrate frequency over time to get phase
    // Simplified: use linear approximation since vibrato is small
    const wave = Math.sin(2 * Math.PI * instFreq * t);

    // ADSR-lite envelope: attack ramp, sustain, release ramp
    let envelope = 1;
    if (i < attackSamples) {
      envelope = i / attackSamples;
    } else if (i > numSamples - releaseSamples) {
      envelope = (numSamples - i) / releaseSamples;
    }
    samples[i] = toInt16(wave * envelope * 0.7); // softer than click — sustained tone
  }
  return samples;
}

// ─── Write files ─────────────────────────────────────────────────────────────
const clickPath = path.join(OUTPUT_DIR, 'click.wav');
const whistlePath = path.join(OUTPUT_DIR, 'whistle.wav');

fs.writeFileSync(clickPath, buildWav(generateClick()));
fs.writeFileSync(whistlePath, buildWav(generateWhistle()));

const clickStats = fs.statSync(clickPath);
const whistleStats = fs.statSync(whistlePath);
console.log(`✓ click.wav    ${(clickStats.size / 1024).toFixed(1)} KB`);
console.log(`✓ whistle.wav  ${(whistleStats.size / 1024).toFixed(1)} KB`);
