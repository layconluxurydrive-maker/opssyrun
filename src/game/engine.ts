import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ProceduralAudio } from './audio';
import { ArticulatedExplorer } from './explorer';
import {
  BIOMES,
  createSeededRng,
  GAME_CONFIG,
  getDailySeedDateString,
  hashDateToSeed,
  PALETTE,
  type BiomeId,
  type GamePhase,
  type PlayerProfile,
  type PowerUpKind,
  type RunMode,
  type RunTelemetry,
  type SavedRunSnapshot,
  type TurnKind,
} from './palette';
import { ParticlePool } from './particles';
import { PatternSpawner } from './patterns';
import { getDefaultProfile } from './profile';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { RuinWorld } from './world';

const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _tmpColorA = new THREE.Color();
const _tmpColorB = new THREE.Color();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export interface EngineCallbacks {
  onTelemetry: (t: RunTelemetry) => void;
  onRunEnded: (result: {
    mode: RunMode;
    distance: number;
    coins: number;
    biomeName: string;
    dailySeedDate: string;
  }) => void;
  onCheckpoint?: (snapshot: SavedRunSnapshot | null) => void;
  onBonusCoins?: (coins: number) => void;
  onContextStatus?: (lost: boolean) => void;
}

export class SunkenRuinsEngine {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly isSoftwareGl: boolean;

  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;

  private readonly textures: ProceduralTextureSet;
  private readonly audio = new ProceduralAudio();
  private readonly explorer: ArticulatedExplorer;
  private readonly world: RuinWorld;
  private readonly spawner: PatternSpawner;
  private readonly particles: ParticlePool;
  private readonly envTexture: THREE.Texture;

  private readonly callbacks: EngineCallbacks;
  private profile: PlayerProfile = getDefaultProfile();

  private frameId = 0;
  private disposed = false;
  private lastTimeMs = 0;
  private elapsed = 0;

  // Game state
  private phase: GamePhase = 'title';
  private runMode: RunMode = 'endless';
  private dailySeedDate = getDailySeedDateString();
  private distance = 0;
  private coins = 0;
  private highScore = 0;
  private isNewRecord = false;
  private speed: number = GAME_CONFIG.baseSpeed;

  // Biome transition state
  private prevBiome: BiomeId = 'courtyard';
  private targetBiome: BiomeId = 'courtyard';
  private biomeBlend = 1;

  // Runner physics
  private targetLane = 0;
  private playerX = 0;
  private prevPlayerX = 0;
  private lateralVelocity = 0;
  private playerY = 0;
  private playerVy = 0;
  private grounded = true;
  private fastFalling = false;
  private sliding = false;
  private slideTimer = 0;
  private jumpBufferTimer = 0;
  private slideDustAccum = 0;

  // 90-degree Temple Turn state
  private turnActive = false;
  private turnDir: -1 | 1 = -1;
  private turnProgress = 0;
  private turnPivotZ = 0;
  private turnBufferDir: -1 | 1 | 0 = 0;
  private turnBufferTimer = 0;

  // Power-ups & Risk-Reward state
  private magnetTimer = 0;
  private magnetMax = 8;
  private hasShield = false;
  private dashTimer = 0;
  private dashMax = 4.5;
  private invulnTimer = 0;
  private stumbleTimer = 0;
  private chaserTimer = 0;
  private nearMissCooldown = 0;
  private nearMissEventId = 0;
  private nearMissLabel = '';

  // Camera dynamics
  private camRoll = 0;
  private camFov = 56;
  private shakeTrauma = 0;
  private lastHudEmitMs = 0;
  private lastCheckpointMs = 0;

  private readonly handleResizeBound: () => void;
  private readonly handleContextLostBound: (e: Event) => void;
  private readonly handleContextRestoredBound: () => void;

  constructor(container: HTMLElement, callbacks: EngineCallbacks, initialProfile?: PlayerProfile) {
    this.container = container;
    this.callbacks = callbacks;
    if (initialProfile) {
      this.profile = initialProfile;
    }
    this.runMode = this.profile.preferredMode;
    this.highScore =
      this.runMode === 'daily' ? this.profile.highScoreDaily : this.profile.highScoreEndless;
    this.audio.setMuted(this.profile.muted);

    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.fogMist);
    this.fog = new THREE.FogExp2(PALETTE.fogMist, BIOMES.courtyard.fogDensity);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(56, width / height, 0.15, 220);
    this.camera.position.set(1.35, 3.1, 5.4);
    this.camera.lookAt(0, 1.35, -8);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    this.hemiLight = new THREE.HemisphereLight(
      BIOMES.courtyard.hemiSky,
      BIOMES.courtyard.hemiGround,
      BIOMES.courtyard.hemiIntensity
    );
    this.hemiLight.position.set(0, 40, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(
      BIOMES.courtyard.sunColor,
      BIOMES.courtyard.sunIntensity
    );
    this.sunLight.position.set(-18, 28, 14);
    this.sunLight.target.position.set(0, 0, -16);
    this.scene.add(this.sunLight.target);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 90;
    const d = 24;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00045;
    this.sunLight.shadow.normalBias = 0.025;
    this.sunLight.shadow.radius = 2.6;
    this.scene.add(this.sunLight);

    const rimLight = new THREE.DirectionalLight(PALETTE.brightGold, 0.58);
    rimLight.position.set(12, 9, -28);
    this.scene.add(rimLight);

    this.textures = createProceduralTextures(this.renderer);
    this.world = new RuinWorld(this.scene, this.textures);
    this.explorer = new ArticulatedExplorer(this.scene, this.textures.contactShadowMap);
    this.explorer.applyCharacter(this.profile.equippedCharacter);
    this.explorer.applyOutfit(this.profile.equippedOutfit);
    this.spawner = new PatternSpawner(this.world.worldPivot, this.world, this.textures);
    this.particles = new ParticlePool(this.scene, this.textures.particleMap);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.handleResizeBound = this.handleResize.bind(this);
    this.handleContextLostBound = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextStatus?.(true);
    };
    this.handleContextRestoredBound = () => {
      this.callbacks.onContextStatus?.(false);
    };

    window.addEventListener('resize', this.handleResizeBound);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLostBound);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestoredBound);

    this.emitTelemetry(true);
    this.lastTimeMs = performance.now();
    this.scheduleNextFrame();
  }

  public applyProfile(profile: PlayerProfile): void {
    this.profile = profile;
    this.audio.setMuted(profile.muted);
    this.explorer.applyCharacter(profile.equippedCharacter);
    this.explorer.applyOutfit(profile.equippedOutfit);
    if (this.phase === 'title') {
      this.highScore =
        this.runMode === 'daily' ? profile.highScoreDaily : profile.highScoreEndless;
      this.emitTelemetry(true);
    }
  }

  public setMode(mode: RunMode): void {
    this.runMode = mode;
    this.highScore =
      mode === 'daily' ? this.profile.highScoreDaily : this.profile.highScoreEndless;
    this.emitTelemetry(true);
  }

  public playUpgradeChime(): void {
    this.audio.unlock();
    this.audio.playUpgrade();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = window.requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public unlockAudio(): void {
    this.audio.unlock();
  }

  public toggleMute(): boolean {
    this.audio.unlock();
    return this.audio.toggleMute();
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public startRun(mode?: RunMode): void {
    this.audio.unlock();
    if (mode) {
      this.runMode = mode;
    }
    this.dailySeedDate = getDailySeedDateString();
    this.highScore =
      this.runMode === 'daily' ? this.profile.highScoreDaily : this.profile.highScoreEndless;

    // Seed RNG deterministically for Daily Temple Seed, or Math.random for Endless Expedition
    if (this.runMode === 'daily') {
      this.spawner.setRng(createSeededRng(hashDateToSeed(this.dailySeedDate)));
    } else {
      this.spawner.setRng(Math.random);
    }

    this.distance = 0;
    this.coins = 0;
    this.isNewRecord = false;
    this.speed = GAME_CONFIG.baseSpeed;
    this.prevBiome = 'courtyard';
    this.targetBiome = 'courtyard';
    this.biomeBlend = 1;

    this.targetLane = 0;
    this.playerX = 0;
    this.prevPlayerX = 0;
    this.lateralVelocity = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.grounded = true;
    this.fastFalling = false;
    this.sliding = false;
    this.slideTimer = 0;
    this.jumpBufferTimer = 0;

    this.turnActive = false;
    this.turnProgress = 0;
    this.turnBufferDir = 0;
    this.turnBufferTimer = 0;

    this.magnetTimer = 0;
    this.magnetMax = 8 + this.profile.upgrades.magnetLevel * 2;
    this.hasShield = false;
    this.dashMax = 4.5 + this.profile.upgrades.dashLevel * 1.0;
    this.dashTimer = 0;
    this.invulnTimer = 0;
    this.stumbleTimer = 0;
    this.chaserTimer = 0;
    this.nearMissCooldown = 0;
    this.shakeTrauma = 0;

    this.world.reset();
    this.explorer.reset();
    this.explorer.applyCharacter(this.profile.equippedCharacter);
    this.explorer.applyOutfit(this.profile.equippedOutfit);
    this.spawner.reset();
    this.particles.clear();

    // Solar Head-Start upgrade (endless expedition launch boost)
    if (this.runMode === 'endless' && this.profile.upgrades.headStartLevel > 0) {
      const surgeSec = this.profile.upgrades.headStartLevel * 2.1;
      this.dashMax = Math.max(this.dashMax, surgeSec);
      this.dashTimer = surgeSec;
      this.audio.playPowerUp('dash');
    }

    this.lastTimeMs = performance.now();
    this.lastCheckpointMs = this.lastTimeMs;
    this.phase = 'playing';
    this.emitTelemetry(true);
  }

  public resumeRun(snapshot: SavedRunSnapshot): void {
    this.audio.unlock();
    this.runMode = snapshot.mode;
    this.dailySeedDate =
      snapshot.mode === 'daily' ? snapshot.dailySeedDate : getDailySeedDateString();

    const storedBest =
      this.runMode === 'daily' ? this.profile.highScoreDaily : this.profile.highScoreEndless;
    this.highScore = Math.max(storedBest, snapshot.distance);
    this.isNewRecord = snapshot.isNewRecord || snapshot.distance > storedBest;

    if (this.runMode === 'daily') {
      const resumeSeed =
        (hashDateToSeed(this.dailySeedDate) ^ Math.imul(snapshot.distance, 2654435761)) >>> 0;
      this.spawner.setRng(createSeededRng(resumeSeed));
    } else {
      this.spawner.setRng(Math.random);
    }

    this.distance = snapshot.distance;
    this.coins = snapshot.coins;
    this.speed = THREE.MathUtils.clamp(
      snapshot.speed,
      GAME_CONFIG.baseSpeed,
      GAME_CONFIG.maxSpeed
    );
    this.prevBiome = snapshot.biome;
    this.targetBiome = snapshot.biome;
    this.biomeBlend = 1;

    this.targetLane = THREE.MathUtils.clamp(Math.round(snapshot.targetLane), -1, 1);
    this.playerX = this.targetLane * GAME_CONFIG.laneWidth;
    this.prevPlayerX = this.playerX;
    this.lateralVelocity = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.grounded = true;
    this.fastFalling = false;
    this.sliding = false;
    this.slideTimer = 0;
    this.jumpBufferTimer = 0;

    this.turnActive = false;
    this.turnProgress = 0;
    this.turnBufferDir = 0;
    this.turnBufferTimer = 0;

    this.magnetMax = 8 + this.profile.upgrades.magnetLevel * 2;
    this.magnetTimer = THREE.MathUtils.clamp(snapshot.magnetRemaining, 0, this.magnetMax);
    this.hasShield = Boolean(snapshot.hasShield);
    this.dashMax = 4.5 + this.profile.upgrades.dashLevel * 1.0;
    this.dashTimer = THREE.MathUtils.clamp(snapshot.dashRemaining, 0, this.dashMax);
    this.invulnTimer = 1.8; // Safe grace window on resume
    this.stumbleTimer = 0;
    this.chaserTimer = THREE.MathUtils.clamp(
      snapshot.chaserTimeLeft,
      0,
      GAME_CONFIG.chaserDuration
    );
    this.nearMissCooldown = 0;
    this.shakeTrauma = 0;

    this.world.reset();
    this.explorer.reset();
    this.explorer.applyCharacter(this.profile.equippedCharacter);
    this.explorer.applyOutfit(this.profile.equippedOutfit);
    this.explorer.root.position.x = this.playerX;
    this.spawner.reset();
    this.particles.clear();

    this.lastTimeMs = performance.now();
    this.lastCheckpointMs = this.lastTimeMs;
    this.phase = 'playing';
    this.emitTelemetry(true);
  }

  public getRunSnapshot(): SavedRunSnapshot | null {
    if (this.phase !== 'playing' && this.phase !== 'paused') {
      return null;
    }
    const roundedDist = Math.floor(this.distance);
    if (roundedDist < 5 && this.coins <= 0) {
      return null;
    }
    return {
      mode: this.runMode,
      dailySeedDate: this.dailySeedDate,
      distance: roundedDist,
      coins: this.coins,
      speed: this.speed,
      isNewRecord: this.isNewRecord,
      biome: this.targetBiome,
      biomeName: BIOMES[this.targetBiome].name,
      targetLane: this.targetLane,
      hasShield: this.hasShield,
      magnetRemaining: this.magnetTimer,
      dashRemaining: this.dashTimer,
      chaserTimeLeft: this.chaserTimer,
      savedAt: Date.now(),
    };
  }

  public returnToTitle(): void {
    this.world.reset();
    this.explorer.reset();
    this.explorer.applyCharacter(this.profile.equippedCharacter);
    this.explorer.applyOutfit(this.profile.equippedOutfit);
    this.spawner.reset();
    this.particles.clear();
    this.prevBiome = 'courtyard';
    this.targetBiome = 'courtyard';
    this.biomeBlend = 1;
    this.chaserTimer = 0;
    this.hasShield = false;
    this.magnetTimer = 0;
    this.dashTimer = 0;
    this.phase = 'title';
    this.highScore =
      this.runMode === 'daily' ? this.profile.highScoreDaily : this.profile.highScoreEndless;
    this.emitTelemetry(true);
  }

  public togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.callbacks.onCheckpoint?.(this.getRunSnapshot());
      this.emitTelemetry(true);
    } else if (this.phase === 'paused') {
      this.lastTimeMs = performance.now();
      this.lastCheckpointMs = this.lastTimeMs;
      this.phase = 'playing';
      this.emitTelemetry(true);
    }
  }

  public moveLane(delta: -1 | 1): void {
    if (this.phase !== 'playing' || this.turnActive) return;
    this.audio.unlock();

    // Check if an active 90-degree Temple Junction is inside the turn timing window
    const junction = this.world.getActiveJunction();
    if (junction && !junction.resolved) {
      const validDir =
        junction.kind === 'tee' ||
        (junction.kind === 'left' && delta === -1) ||
        (junction.kind === 'right' && delta === 1);

      if (validDir && junction.z >= -7.4 && junction.z <= 3.7) {
        this.beginTurn(delta, junction.z);
        return;
      }

      // Slightly early swipe inside approach runway: buffer the turn!
      if (validDir && junction.z >= -12.5 && junction.z < -7.4) {
        this.turnBufferDir = delta;
        this.turnBufferTimer = GAME_CONFIG.turnBufferWindow;
      }
    }

    const next = THREE.MathUtils.clamp(this.targetLane + delta, -1, 1);
    if (next !== this.targetLane) {
      this.targetLane = next;
      this.audio.playLaneShift();
    }
  }

  private beginTurn(dir: -1 | 1, junctionZ: number): void {
    const junction = this.world.getActiveJunction();
    if (!junction || junction.resolved) return;

    junction.resolved = true;
    this.turnActive = true;
    this.turnDir = dir;
    this.turnProgress = 0;
    this.turnPivotZ = junctionZ;
    this.turnBufferDir = 0;
    this.turnBufferTimer = 0;

    // Pivot worldPivot around (0, 0, junctionZ) without moving anything visually on frame 0
    this.world.worldPivot.position.set(0, 0, junctionZ);
    const children = this.world.worldPivot.children;
    for (let i = 0; i < children.length; i++) {
      children[i].position.z -= junctionZ;
    }

    // Map timing accuracy into the new corridor's matching lane (-1, 0, 1)
    const offsetInCorner = dir === -1 ? junctionZ : -junctionZ;
    this.targetLane = THREE.MathUtils.clamp(
      Math.round(offsetInCorner / GAME_CONFIG.laneWidth),
      -1,
      1
    );

    this.audio.playTurn();
    this.particles.spawnDust(this.playerX, 0, 0, 7, 0.55);
  }

  public jump(): void {
    this.audio.unlock();
    if (this.phase === 'title' || this.phase === 'gameover') {
      this.startRun();
      return;
    }
    if (this.phase !== 'playing') return;

    if (this.grounded) {
      this.executeJump();
    } else {
      this.jumpBufferTimer = GAME_CONFIG.jumpBufferWindow;
    }
  }

  private executeJump(): void {
    this.grounded = false;
    this.fastFalling = false;
    this.sliding = false;
    this.slideTimer = 0;
    this.jumpBufferTimer = 0;
    this.playerVy = GAME_CONFIG.jumpVelocity;
    this.explorer.triggerJumpSquash();
    this.emitStrideTrail(6);
    this.audio.playJump();
  }

  public slideOrFastFall(): void {
    this.audio.unlock();
    if (this.phase !== 'playing') return;

    if (!this.grounded) {
      if (!this.fastFalling) {
        this.fastFalling = true;
        this.playerVy = Math.min(this.playerVy, -14.5);
        this.audio.playFastFall();
      }
      return;
    }

    if (!this.sliding) {
      this.sliding = true;
      this.slideTimer = GAME_CONFIG.slideDuration;
      this.emitStrideTrail(5);
      this.audio.playSlide();
    } else {
      this.slideTimer = Math.max(this.slideTimer, GAME_CONFIG.slideDuration * 0.65);
    }
  }

  private emitStrideTrail(count: number): void {
    const trail = this.profile.equippedTrail;
    if (this.dashTimer > 0 || trail === 'gold') {
      this.particles.spawnGoldTrail(this.playerX, this.playerY, 0.22, count);
    } else if (trail === 'jade') {
      this.particles.spawnJadeTrail(this.playerX, this.playerY, 0.22, count);
    } else {
      this.particles.spawnDust(this.playerX, this.playerY, 0.22, count, 0.36);
    }
  }

  private tick(): void {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastTimeMs) * 0.001;
    this.lastTimeMs = nowMs;
    const dt = Math.min(rawDt, 0.05);

    if (this.phase !== 'paused') {
      this.elapsed += dt;
    }

    if (this.phase === 'playing') {
      this.stepPlaying(dt);
    } else if (this.phase === 'title') {
      this.stepTitlePreview(dt);
    } else if (this.phase === 'gameover') {
      this.stepGameOver(dt);
    }

    this.updateBiomeLighting(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);

    if (this.phase === 'playing' && nowMs - this.lastHudEmitMs >= 55) {
      this.emitTelemetry(false);
    }

    if (this.phase === 'playing' && nowMs - this.lastCheckpointMs >= 1000) {
      this.lastCheckpointMs = nowMs;
      this.callbacks.onCheckpoint?.(this.getRunSnapshot());
    }

    this.scheduleNextFrame();
  }

  private stepTitlePreview(dt: number): void {
    const cruiseSpeed = 10.5;
    this.world.update(dt, cruiseSpeed, this.elapsed);
    this.spawner.update(dt, cruiseSpeed, this.elapsed, true, 'courtyard', false, 0, 0);
    this.particles.update(dt, cruiseSpeed);

    const stepFired = this.explorer.update({
      dt,
      speed: cruiseSpeed,
      speedRatio: 0.1,
      y: 0,
      vy: 0,
      grounded: true,
      sliding: false,
      slideProgress: 0,
      lateralVelocity: 0,
      crashed: false,
      stumbling: false,
      previewMode: true,
      hasShield: false,
      magnetActive: false,
      dashActive: false,
      chaserProximity: 0,
    });
    if (stepFired) {
      this.emitStrideTrail(3);
    }
  }

  private stepGameOver(dt: number): void {
    this.world.update(dt, 0, this.elapsed);
    this.particles.update(dt, 0);
    this.explorer.update({
      dt,
      speed: 0,
      speedRatio: 0,
      y: 0,
      vy: 0,
      grounded: true,
      sliding: false,
      slideProgress: 0,
      lateralVelocity: 0,
      crashed: true,
      stumbling: false,
      previewMode: false,
      hasShield: false,
      magnetActive: false,
      dashActive: false,
      chaserProximity: this.chaserTimer > 0 ? 1 : 0,
    });
  }

  private stepPlaying(dt: number): void {
    // Handle smooth 90-degree Temple Turn pivot animation
    if (this.turnActive) {
      this.turnProgress = Math.min(1, this.turnProgress + dt / 0.21);
      const eased = 1 - Math.pow(1 - this.turnProgress, 3);
      this.world.worldPivot.rotation.y = this.turnDir * (Math.PI / 2) * eased;
      this.world.worldPivot.position.z = THREE.MathUtils.lerp(this.turnPivotZ, 0, eased);

      const targetX = this.targetLane * GAME_CONFIG.laneWidth;
      this.playerX = THREE.MathUtils.damp(this.playerX, targetX, 20, dt);
      this.explorer.root.position.x = this.playerX;

      this.particles.update(dt, this.speed * 0.5);

      if (this.turnProgress >= 1) {
        this.turnActive = false;
        this.world.clearJunctionAndRebaseSegments();
        this.spawner.clearAfterTurn();
      }
      return;
    }

    // Power-up countdowns
    if (this.magnetTimer > 0) this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.stumbleTimer > 0) this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    if (this.chaserTimer > 0) this.chaserTimer = Math.max(0, this.chaserTimer - dt);
    if (this.nearMissCooldown > 0) this.nearMissCooldown = Math.max(0, this.nearMissCooldown - dt);
    if (this.turnBufferTimer > 0) this.turnBufferTimer = Math.max(0, this.turnBufferTimer - dt);

    const dashActive = this.dashTimer > 0;
    const baseRunSpeed = Math.min(
      GAME_CONFIG.maxSpeed,
      this.speed + GAME_CONFIG.speedRampPerSec * dt
    );
    this.speed = baseRunSpeed;
    const effectiveSpeed = dashActive ? Math.min(54, baseRunSpeed * 1.95) : baseRunSpeed;
    const speedRatio = THREE.MathUtils.clamp(
      (effectiveSpeed - GAME_CONFIG.baseSpeed) / (GAME_CONFIG.maxSpeed - GAME_CONFIG.baseSpeed),
      0,
      1.35
    );

    // Distance & Biome progression every 500m
    this.distance += effectiveSpeed * dt;
    const roundedDist = Math.floor(this.distance);
    if (roundedDist > this.highScore) {
      this.highScore = roundedDist;
      this.isNewRecord = true;
    }

    const biomeOrder: BiomeId[] = ['courtyard', 'aqueduct', 'vault'];
    const desiredBiome =
      biomeOrder[Math.floor(this.distance / GAME_CONFIG.biomeIntervalMeters) % biomeOrder.length];
    if (desiredBiome !== this.targetBiome) {
      this.prevBiome = this.targetBiome;
      this.targetBiome = desiredBiome;
      this.biomeBlend = 0;
    }

    // Lateral lane damping
    this.prevPlayerX = this.playerX;
    const targetX = this.targetLane * GAME_CONFIG.laneWidth;
    this.playerX = THREE.MathUtils.damp(this.playerX, targetX, 17, dt);
    this.lateralVelocity = dt > 0.0001 ? (this.playerX - this.prevPlayerX) / dt : 0;
    this.explorer.root.position.x = this.playerX;

    // Input jump buffer
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    // Vertical jump & fast-fall physics
    if (!this.grounded) {
      const grav = this.fastFalling ? GAME_CONFIG.fastFallGravity : GAME_CONFIG.gravity;
      this.playerVy -= grav * dt;
      this.playerY += this.playerVy * dt;

      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVy = 0;
        this.grounded = true;

        const wasFastFall = this.fastFalling;
        this.fastFalling = false;
        this.explorer.triggerLandSquash(wasFastFall);
        this.emitStrideTrail(wasFastFall ? 9 : 4);

        if (wasFastFall) {
          this.shakeTrauma = Math.max(this.shakeTrauma, 0.22);
          this.audio.playFootstep(1);
        }

        if (this.jumpBufferTimer > 0) {
          this.executeJump();
        }
      }
    }

    // Slide timer
    let slideProgress = 0;
    if (this.sliding) {
      this.slideTimer -= dt;
      slideProgress = 1 - Math.max(0, this.slideTimer / GAME_CONFIG.slideDuration);
      this.slideDustAccum += dt;
      if (this.slideDustAccum >= 0.055) {
        this.slideDustAccum = 0;
        this.emitStrideTrail(2);
      }
      if (this.slideTimer <= 0) {
        this.sliding = false;
        this.slideTimer = 0;
      }
    }

    // Update world, spawner, particles
    this.world.update(dt, effectiveSpeed, this.elapsed);
    this.spawner.update(
      dt,
      effectiveSpeed,
      this.elapsed,
      false,
      this.targetBiome,
      this.magnetTimer > 0 || dashActive,
      this.playerX,
      this.playerY
    );
    this.particles.update(dt, effectiveSpeed);

    // Check junction timing window, buffered turns, dash auto-turn, or missed corner edge!
    const junction = this.world.getActiveJunction();
    if (junction && !junction.resolved) {
      if (
        this.turnBufferTimer > 0 &&
        this.turnBufferDir !== 0 &&
        junction.z >= -7.4 &&
        junction.z <= 3.7
      ) {
        const valid =
          junction.kind === 'tee' ||
          (junction.kind === 'left' && this.turnBufferDir === -1) ||
          (junction.kind === 'right' && this.turnBufferDir === 1);
        if (valid) {
          this.beginTurn(this.turnBufferDir, junction.z);
          return;
        }
      }

      // Sunburst Dash auto-navigates 90-degree turns safely!
      if (dashActive && junction.z >= -1.8) {
        const autoDir: -1 | 1 =
          junction.kind === 'right' ? 1 : junction.kind === 'left' ? -1 : this.playerX >= 0 ? 1 : -1;
        this.beginTurn(autoDir, junction.z);
        return;
      }

      // Missed the turn at the outer parapet edge!
      if (junction.z > 3.75) {
        if (this.hasShield || this.invulnTimer > 0) {
          if (this.hasShield) {
            this.shatterShield();
          }
          const safeDir: -1 | 1 =
            junction.kind === 'right' ? 1 : junction.kind === 'left' ? -1 : this.playerX >= 0 ? 1 : -1;
          this.beginTurn(safeDir, 3.2);
          return;
        } else {
          this.triggerGameOver();
          return;
        }
      }
    }

    const chaserProx =
      this.chaserTimer > 0 ? THREE.MathUtils.clamp(this.chaserTimer / 2.5, 0.25, 1.0) : 0;

    const footstepFired = this.explorer.update({
      dt,
      speed: effectiveSpeed,
      speedRatio,
      y: this.playerY,
      vy: this.playerVy,
      grounded: this.grounded,
      sliding: this.sliding,
      slideProgress,
      lateralVelocity: this.lateralVelocity,
      crashed: false,
      stumbling: this.stumbleTimer > 0,
      previewMode: false,
      hasShield: this.hasShield,
      magnetActive: this.magnetTimer > 0,
      dashActive,
      chaserProximity: chaserProx,
    });

    if (footstepFired && this.grounded && !this.sliding) {
      this.emitStrideTrail(dashActive || this.profile.equippedTrail !== 'dust' ? 4 : 3);
      this.audio.playFootstep(speedRatio);
    }

    this.checkCoins();
    this.checkPowerUps();
    this.checkCollisionsAndNearMiss(dashActive);
  }

  private updateBiomeLighting(dt: number): void {
    if (this.biomeBlend < 1) {
      this.biomeBlend = Math.min(1, this.biomeBlend + dt * 0.4);
    }
    const fromDef = BIOMES[this.prevBiome];
    const toDef = BIOMES[this.targetBiome];
    const t = this.biomeBlend;

    _tmpColorA.setHex(fromDef.sunColor);
    _tmpColorB.setHex(toDef.sunColor);
    this.sunLight.color.copy(_tmpColorA.lerp(_tmpColorB, t));
    this.sunLight.intensity = THREE.MathUtils.lerp(fromDef.sunIntensity, toDef.sunIntensity, t);

    _tmpColorA.setHex(fromDef.hemiSky);
    _tmpColorB.setHex(toDef.hemiSky);
    this.hemiLight.color.copy(_tmpColorA.lerp(_tmpColorB, t));

    _tmpColorA.setHex(fromDef.hemiGround);
    _tmpColorB.setHex(toDef.hemiGround);
    this.hemiLight.groundColor.copy(_tmpColorA.lerp(_tmpColorB, t));
    this.hemiLight.intensity = THREE.MathUtils.lerp(fromDef.hemiIntensity, toDef.hemiIntensity, t);

    _tmpColorA.setHex(fromDef.fogColor);
    _tmpColorB.setHex(toDef.fogColor);
    _tmpColorA.lerp(_tmpColorB, t);
    (this.scene.background as THREE.Color).copy(_tmpColorA);
    this.fog.color.copy(_tmpColorA);
    this.fog.density = THREE.MathUtils.lerp(fromDef.fogDensity, toDef.fogDensity, t);

    this.world.applyBiomeVisuals(fromDef, toDef, t, dt, this.elapsed, this.particles);
  }

  private checkCoins(): void {
    const playerMinY = this.playerY;
    const playerMaxY = this.playerY + (this.sliding ? 1.05 : 1.9);
    const activeCoins = this.spawner.getCoins();
    let collectedAny = false;

    for (let i = 0; i < activeCoins.length; i++) {
      const coin = activeCoins[i];
      if (coin.collected) continue;
      if (Math.abs(coin.z) > 1.15) continue;
      if (Math.abs(coin.x - this.playerX) > 1.15) continue;
      if (coin.baseY + 0.5 < playerMinY || coin.baseY - 0.5 > playerMaxY) continue;

      coin.collected = true;
      this.coins += coin.value;
      collectedAny = true;
      this.particles.spawnCoinBurst(coin.x, coin.baseY, coin.z, 12);
      this.audio.playCoin();
    }

    if (collectedAny) {
      this.emitTelemetry(true);
    }
  }

  private checkPowerUps(): void {
    const playerMinY = this.playerY;
    const playerMaxY = this.playerY + (this.sliding ? 1.1 : 1.95);
    const list = this.spawner.getPowerUps();

    for (let i = 0; i < list.length; i++) {
      const pu = list[i];
      if (pu.collected) continue;
      if (Math.abs(pu.z) > 1.15) continue;
      if (Math.abs(pu.x - this.playerX) > 1.15) continue;
      if (pu.baseY + 0.65 < playerMinY || pu.baseY - 0.65 > playerMaxY) continue;

      pu.collected = true;
      this.activatePowerUp(pu.kind, pu.x, pu.baseY);
    }
  }

  private activatePowerUp(kind: PowerUpKind, x: number, y: number): void {
    this.audio.playPowerUp(kind);
    if (kind === 'magnet') {
      this.magnetMax = 8 + this.profile.upgrades.magnetLevel * 2;
      this.magnetTimer = this.magnetMax;
      this.particles.spawnJadeTrail(x, y, 0, 16);
    } else if (kind === 'shield') {
      this.hasShield = true;
      this.particles.spawnAmberShatter(x, y - 0.5, 0, 16);
    } else {
      this.dashMax = 4.5 + this.profile.upgrades.dashLevel * 1.0;
      this.dashTimer = this.dashMax;
      this.particles.spawnCoinBurst(x, y, 0, 20);
    }
    this.emitTelemetry(true);
  }

  private shatterShield(): void {
    this.hasShield = false;
    const graceSec = 1.2 + this.profile.upgrades.shieldLevel * 0.4;
    this.invulnTimer = graceSec;
    const bonusNaira = this.profile.upgrades.shieldLevel * 250;
    if (bonusNaira > 0) {
      this.coins += bonusNaira;
    }
    this.shakeTrauma = Math.max(this.shakeTrauma, 0.55);
    this.particles.spawnAmberShatter(this.playerX, this.playerY, 0, 26);
    this.audio.playShieldShatter();
    this.emitTelemetry(true);
  }

  private checkCollisionsAndNearMiss(dashActive: boolean): void {
    const playerHalfW = 0.36;
    const playerHalfD = 0.32;
    const playerMinY = this.playerY + 0.06;
    const playerMaxY = this.playerY + (this.sliding ? 0.86 : 1.72);

    const obstacles = this.spawner.getObstacles();
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];

      // Near-miss Close Call check right as obstacle passes behind runner
      if (!obs.nearMissChecked && !obs.hitHandled && !dashActive && obs.z > 0.55 && obs.z < 2.2) {
        obs.nearMissChecked = true;
        if (this.nearMissCooldown <= 0) {
          const obsX = obs.lane * GAME_CONFIG.laneWidth;
          const dx = Math.abs(obsX - this.playerX);
          let label = '';

          if (obs.kind === 'pillar' && dx > obs.halfWidth + playerHalfW && dx <= obs.halfWidth + 1.08) {
            label = 'Close Call +25m';
          } else if (obs.kind === 'arch' && dx < obs.halfWidth + 0.15 && this.sliding) {
            label = 'Low Slide +25m';
          } else if (
            (obs.kind === 'log' || obs.kind === 'gap') &&
            dx < obs.halfWidth &&
            !this.grounded &&
            this.playerY > obs.maxY &&
            this.playerY < obs.maxY + 0.92
          ) {
            label = 'Razor Leap +25m';
          }

          if (label) {
            this.nearMissCooldown = 1.05;
            this.distance += GAME_CONFIG.nearMissBonus;
            this.nearMissEventId++;
            this.nearMissLabel = label;
            this.audio.playNearMiss();
            this.emitTelemetry(true);
          }
        }
      }

      if (obs.hitHandled) continue;
      if (Math.abs(obs.z) > obs.halfDepth + playerHalfD) continue;

      const obsX = obs.lane * GAME_CONFIG.laneWidth;
      const dx = Math.abs(obsX - this.playerX);

      // Broken Bridge Gap check
      if (obs.kind === 'gap') {
        if (this.playerY < 0.14) {
          if (dashActive || this.invulnTimer > 0) {
            obs.hitHandled = true;
            continue;
          }
          if (this.hasShield) {
            obs.hitHandled = true;
            this.shatterShield();
            // Boost runner cleanly across the gap!
            this.grounded = false;
            this.playerVy = 10.5;
            continue;
          }
          obs.hitHandled = true;
          this.triggerGameOver();
          return;
        }
        continue;
      }

      // Standard AABB overlap check
      if (dx > obs.halfWidth + playerHalfW) continue;
      if (playerMaxY < obs.minY || playerMinY > obs.maxY) continue;

      // Sunburst Dash smashes straight through obstacles!
      if (dashActive || this.invulnTimer > 0) {
        obs.hitHandled = true;
        if (obs.mesh && dashActive) {
          this.particles.spawnCoinBurst(obsX, 1.0, obs.z, 12);
          this.shakeTrauma = Math.max(this.shakeTrauma, 0.25);
        }
        continue;
      }

      // Check for Stumble Graze (edge of log/pillar or clipping top lip of low log)
      const isEdgeGraze = dx > obs.halfWidth + 0.08;
      const isLogTopClip = obs.kind === 'log' && playerMinY >= obs.maxY - 0.26;
      if ((isEdgeGraze || isLogTopClip) && this.chaserTimer <= 0) {
        obs.hitHandled = true;
        this.stumbleTimer = 0.45;
        this.chaserTimer = GAME_CONFIG.chaserDuration;
        this.shakeTrauma = Math.max(this.shakeTrauma, 0.58);
        this.particles.spawnDust(this.playerX, this.playerY + 0.2, 0, 10, 0.7);
        this.audio.playStumble();
        this.emitTelemetry(true);
        continue;
      }

      // Full collision: Amber Aegis absorbs one lethal hit!
      if (this.hasShield) {
        obs.hitHandled = true;
        this.shatterShield();
        continue;
      }

      obs.hitHandled = true;
      this.triggerGameOver();
      return;
    }
  }

  private triggerGameOver(): void {
    this.phase = 'gameover';
    this.shakeTrauma = 1.0;
    this.audio.playCrash();
    this.particles.spawnDust(this.playerX, this.playerY + 0.4, 0, 16, 0.9);

    const finalDist = Math.floor(this.distance);
    this.callbacks.onRunEnded({
      mode: this.runMode,
      distance: finalDist,
      coins: this.coins,
      biomeName: BIOMES[this.targetBiome].name,
      dailySeedDate: this.dailySeedDate,
    });
    this.emitTelemetry(true);
  }

  private updateCamera(dt: number): void {
    const dashActive = this.dashTimer > 0;
    const speedRatio = THREE.MathUtils.clamp(
      (this.speed - GAME_CONFIG.baseSpeed) / (GAME_CONFIG.maxSpeed - GAME_CONFIG.baseSpeed),
      0,
      1
    );

    if (this.phase === 'title') {
      const sway = Math.sin(this.elapsed * 0.45) * 0.38;
      _camTargetPos.set(1.45 + sway, 3.05, 5.55);
      _camLookAt.set(-0.2, 1.45, -10.5);

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTargetPos.x, 4, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTargetPos.y, 4, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTargetPos.z, 4, dt);
      this.camFov = THREE.MathUtils.damp(this.camFov, 54, 4, dt);
      this.camRoll = THREE.MathUtils.damp(this.camRoll, 0, 6, dt);
    } else {
      const targetX = this.playerX * 0.62;
      const targetY = 3.85 + this.playerY * 0.36;
      const targetZ = 6.95 - speedRatio * 0.35 + (this.chaserTimer > 0 ? 0.55 : 0);

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetX, 9.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetY, 8.5, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetZ, 7, dt);

      _camLookAt.set(this.playerX * 0.42, 1.42 + this.playerY * 0.28, -9.8);

      const desiredFov = 56 + speedRatio * 10 + (dashActive ? 7.5 : 0);
      this.camFov = THREE.MathUtils.damp(this.camFov, desiredFov, 5.5, dt);

      const desiredRoll = THREE.MathUtils.clamp(-this.lateralVelocity * 0.005, -0.055, 0.055);
      this.camRoll = THREE.MathUtils.damp(this.camRoll, desiredRoll, 9, dt);
    }

    let shakeX = 0;
    let shakeY = 0;
    let shakeRoll = 0;
    if (this.shakeTrauma > 0.001) {
      const mag = this.shakeTrauma * this.shakeTrauma;
      shakeX = (Math.random() - 0.5) * 0.55 * mag;
      shakeY = (Math.random() - 0.5) * 0.42 * mag;
      shakeRoll = (Math.random() - 0.5) * 0.08 * mag;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.4);
    }

    if (Math.abs(this.camera.fov - this.camFov) > 0.02) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.x += shakeX;
    this.camera.position.y += shakeY;
    this.camera.lookAt(_camLookAt);
    this.camera.rotation.z += this.camRoll + shakeRoll;
    this.camera.position.x -= shakeX;
    this.camera.position.y -= shakeY;
  }

  private emitTelemetry(force: boolean): void {
    this.lastHudEmitMs = performance.now();
    const speedRatio = THREE.MathUtils.clamp(
      (this.speed - GAME_CONFIG.baseSpeed) / (GAME_CONFIG.maxSpeed - GAME_CONFIG.baseSpeed),
      0,
      1
    );
    const junction = this.world.getActiveJunction();
    const pendingTurn =
      junction && !junction.resolved && junction.z >= -11.5 && junction.z <= 3.7
        ? junction.kind
        : null;

    if (force || this.phase === 'playing') {
      this.callbacks.onTelemetry({
        phase: this.phase,
        mode: this.runMode,
        dailySeedDate: this.dailySeedDate,
        distance: Math.floor(this.distance),
        coins: this.coins,
        highScore: this.highScore,
        isNewRecord: this.isNewRecord,
        speedRatio,
        biome: this.targetBiome,
        biomeName: BIOMES[this.targetBiome].name,
        magnetRemaining: this.magnetTimer,
        magnetMax: this.magnetMax,
        hasShield: this.hasShield,
        dashRemaining: this.dashTimer,
        dashMax: this.dashMax,
        chaserActive: this.chaserTimer > 0,
        chaserTimeLeft: this.chaserTimer,
        pendingTurn,
        nearMissEventId: this.nearMissEventId,
        nearMissLabel: this.nearMissLabel,
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResizeBound);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLostBound);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestoredBound);

    this.explorer.dispose();
    this.world.dispose();
    this.spawner.dispose();
    this.particles.dispose();
    this.textures.dispose();
    this.envTexture.dispose();
    this.audio.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
