import type { PowerUpKind } from './palette';

export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private coinStreak = 0;
  private lastCoinTime = 0;
  private footToggle = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.72, this.ctx.currentTime, 0.02);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.72;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 1.5);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = white * 0.55 + last * 1.4;
    }
    return buffer;
  }

  private ready(): boolean {
    return !this.muted && this.ctx !== null && this.ctx.state === 'running' && this.masterGain !== null;
  }

  public playFootstep(speedRatio = 0): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    this.footToggle = !this.footToggle;
    const pitchBias = this.footToggle ? 1.06 : 0.94;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((720 + speedRatio * 180) * pitchBias, now);
    filter.Q.value = 1.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, Math.random() * 0.5, 0.08);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(118 * pitchBias, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.055);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.065, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playJump(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340, now);
    filter.frequency.exponentialRampToValueAtTime(1450, now + 0.19);
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, 0.1, 0.24);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.06, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playSlide(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1150, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + 0.34);
    filter.Q.value = 1.1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, 0.2, 0.38);
  }

  public playFastFall(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.18);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, 0.4, 0.2);
  }

  public playLaneShift(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620, now);
    filter.frequency.exponentialRampToValueAtTime(920, now + 0.08);
    filter.Q.value = 2.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, 0.15, 0.11);
  }

  public playTurn(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Crisp wind-pivot rush
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(480, now);
    filter.frequency.exponentialRampToValueAtTime(1320, now + 0.14);
    filter.Q.value = 1.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, 0.1, 0.24);

    // Subtle stone slide accent
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.15);

    const oGain = this.ctx.createGain();
    oGain.gain.setValueAtTime(0.075, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playCoin(): void {
    if (!this.ready() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    if (now - this.lastCoinTime < 1.15) {
      this.coinStreak = Math.min(this.coinStreak + 1, 9);
    } else {
      this.coinStreak = 0;
    }
    this.lastCoinTime = now;

    const freqs = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];
    const baseFreq = freqs[this.coinStreak];

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.01, now + 0.28);

    const g1 = this.ctx.createGain();
    g1.gain.setValueAtTime(0.001, now);
    g1.gain.linearRampToValueAtTime(0.15, now + 0.008);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc1.connect(g1);
    g1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 0.38);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * 2.42, now);

    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.001, now);
    g2.gain.linearRampToValueAtTime(0.06, now + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc2.connect(g2);
    g2.connect(this.masterGain);
    osc2.start(now);
    osc2.stop(now + 0.18);
  }

  public playPowerUp(kind: PowerUpKind): void {
    if (!this.ready() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes =
      kind === 'magnet'
        ? [392.0, 493.88, 587.33, 783.99]
        : kind === 'shield'
          ? [329.63, 440.0, 523.25, 659.25]
          : [440.0, 587.33, 880.0, 1174.66];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.055;
      const osc = this.ctx.createOscillator();
      osc.type = kind === 'dash' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.37);
    });
  }

  public playShieldShatter(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Crystalline amber burst
    [1318.5, 987.77, 740.0].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + i * 0.03;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.68, t + 0.22);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.25);
    });

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1600, now);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.22, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now, 0.1, 0.26);
  }

  public playNearMiss(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Crisp wind slice
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(650, now + 0.14);
    filter.Q.value = 2.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, 0.3, 0.16);

    // Bright gold style sting
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, now);
    osc.frequency.setValueAtTime(1567.98, now + 0.05);

    const oGain = this.ctx.createGain();
    oGain.gain.setValueAtTime(0.001, now);
    oGain.gain.linearRampToValueAtTime(0.11, now + 0.01);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playStumble(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Stone trip thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.24);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.28);

    // Spectral temple hound snarl cue
    const growl = this.ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.setValueAtTime(92, now + 0.06);
    growl.frequency.linearRampToValueAtTime(64, now + 0.38);

    const gFilter = this.ctx.createBiquadFilter();
    gFilter.type = 'lowpass';
    gFilter.frequency.setValueAtTime(340, now + 0.06);

    const gGain = this.ctx.createGain();
    gGain.gain.setValueAtTime(0.001, now + 0.06);
    gGain.gain.linearRampToValueAtTime(0.11, now + 0.12);
    gGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    growl.connect(gFilter);
    gFilter.connect(gGain);
    gGain.connect(this.masterGain);
    growl.start(now + 0.06);
    growl.stop(now + 0.44);
  }

  public playUpgrade(): void {
    if (!this.ready() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 1046.5].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + i * 0.045;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.13, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playCrash(): void {
    if (!this.ready() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.42);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.45, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.48);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(780, now);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.4);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.32, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now, 0, 0.45);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.noiseBuffer = null;
    }
  }
}
