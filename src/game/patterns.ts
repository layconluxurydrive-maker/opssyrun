import * as THREE from 'three';
import {
  GAME_CONFIG,
  NAIRA_DENOMINATIONS,
  PALETTE,
  type BiomeId,
  type NairaDenomination,
  type NairaValue,
  type PowerUpKind,
  type TurnKind,
} from './palette';
import type { ProceduralTextureSet } from './textures';
import type { RuinWorld } from './world';

export type ObstacleKind = 'log' | 'arch' | 'pillar' | 'gap';

export interface ActiveObstacle {
  id: number;
  kind: ObstacleKind;
  lane: number; // -1, 0, 1 (for gap, covers all 3 lanes)
  z: number;
  mesh: THREE.Group | null;
  halfWidth: number;
  halfDepth: number;
  minY: number;
  maxY: number;
  nearMissChecked: boolean;
  hitHandled: boolean;
}

export interface ActiveCoin {
  id: number;
  value: NairaValue;
  x: number;
  baseY: number;
  z: number;
  collected: boolean;
  magnetized: boolean;
  mesh: THREE.Group;
  phase: number;
}

export interface ActivePowerUp {
  id: number;
  kind: PowerUpKind;
  x: number;
  baseY: number;
  z: number;
  collected: boolean;
  mesh: THREE.Group;
  phase: number;
}

export class PatternSpawner {
  private readonly parentGroup: THREE.Group;
  private readonly world: RuinWorld;
  private rng: () => number = Math.random;

  private readonly obstacles: ActiveObstacle[] = [];
  private readonly coins: ActiveCoin[] = [];
  private readonly powerUps: ActivePowerUp[] = [];

  private readonly poolLog: THREE.Group[] = [];
  private readonly poolArch: THREE.Group[] = [];
  private readonly poolPillar: THREE.Group[] = [];
  private readonly poolNaira = new Map<NairaValue, THREE.Group[]>();
  private readonly nairaMaterials = new Map<NairaValue, THREE.Material[]>();
  private readonly nairaGeo: THREE.BoxGeometry;
  private readonly poolMagnet: THREE.Group[] = [];
  private readonly poolShield: THREE.Group[] = [];
  private readonly poolDash: THREE.Group[] = [];

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private nextSpawnZ = -44;
  private lastSafeLane = 0;
  private waveIndex = 0;
  private wavesSinceTurn = 0;
  private wavesSincePowerUp = 0;
  private nextId = 1;

  // Shared materials
  private readonly pillarMat: THREE.MeshStandardMaterial;
  private readonly timberMat: THREE.MeshStandardMaterial;
  private readonly timberEndMat: THREE.MeshStandardMaterial;
  private readonly slateMat: THREE.MeshStandardMaterial;
  private readonly mossMat: THREE.MeshStandardMaterial;
  private readonly goldTrimMat: THREE.MeshStandardMaterial;
  private readonly coinMat: THREE.MeshStandardMaterial;

  constructor(parentGroup: THREE.Group, world: RuinWorld, textures: ProceduralTextureSet) {
    this.parentGroup = parentGroup;
    this.world = world;

    this.pillarMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.pillarMap,
        bumpMap: textures.pillarBump,
        bumpScale: 0.065,
        roughness: 0.84,
        metalness: 0.05,
      })
    );

    this.timberMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.timberMap,
        bumpMap: textures.timberBump,
        bumpScale: 0.075,
        roughness: 0.92,
        metalness: 0.02,
      })
    );

    this.timberEndMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7e5a3e,
        roughness: 0.88,
        metalness: 0.02,
      })
    );

    this.slateMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.shadowSlate,
        roughness: 0.72,
        metalness: 0.14,
      })
    );

    this.mossMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.mossGreen,
        roughness: 0.94,
        metalness: 0.0,
      })
    );

    this.goldTrimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.hammeredGold,
        roughness: 0.34,
        metalness: 0.82,
      })
    );

    this.coinMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.goldMap,
        bumpMap: textures.goldBump,
        bumpScale: 0.04,
        color: PALETTE.brightGold,
        roughness: 0.22,
        metalness: 0.92,
      })
    );

    this.nairaGeo = this.trackGeo(new THREE.BoxGeometry(0.86, 0.44, 0.028));

    for (const denom of NAIRA_DENOMINATIONS) {
      const edgeMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: denom.edgeHex,
          roughness: 0.48,
          metalness: 0.12,
        })
      );
      const faceMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.nairaMaps[denom.value],
          emissive: 0xffffff,
          emissiveMap: textures.nairaMaps[denom.value],
          emissiveIntensity: 0.18,
          roughness: 0.34,
          metalness: 0.18,
        })
      );
      this.nairaMaterials.set(denom.value, [
        edgeMat,
        edgeMat,
        edgeMat,
        edgeMat,
        faceMat,
        faceMat,
      ]);

      const pool: THREE.Group[] = [];
      for (let i = 0; i < 48; i++) {
        pool.push(this.createNairaGroup(denom));
      }
      this.poolNaira.set(denom.value, pool);
    }

    for (let i = 0; i < 14; i++) {
      this.poolLog.push(this.createLogGroup());
      this.poolArch.push(this.createArchGroup());
      this.poolPillar.push(this.createPillarGroup());
    }
    for (let i = 0; i < 4; i++) {
      this.poolMagnet.push(this.createPowerUpGroup('magnet'));
      this.poolShield.push(this.createPowerUpGroup('shield'));
      this.poolDash.push(this.createPowerUpGroup('dash'));
    }
  }

  public setRng(rng: () => number): void {
    this.rng = rng;
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  private createLogGroup(): THREE.Group {
    const group = new THREE.Group();

    const trunkGeo = this.trackGeo(new THREE.CylinderGeometry(0.42, 0.48, 2.38, 12));
    const trunk = new THREE.Mesh(trunkGeo, [this.timberMat, this.timberEndMat, this.timberEndMat]);
    trunk.rotation.z = Math.PI / 2;
    trunk.position.set(0, 0.45, 0);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    const branchGeo = this.trackGeo(new THREE.CylinderGeometry(0.11, 0.17, 0.68, 8));
    const branch = new THREE.Mesh(branchGeo, this.timberMat);
    branch.position.set(0.55, 0.78, -0.14);
    branch.rotation.set(0.25, 0, -0.58);
    branch.castShadow = true;
    group.add(branch);

    const chockGeo = this.trackGeo(new THREE.BoxGeometry(0.36, 0.34, 0.88));
    for (const sx of [-0.95, 0.95]) {
      const chock = new THREE.Mesh(chockGeo, this.slateMat);
      chock.position.set(sx, 0.17, 0);
      chock.castShadow = true;
      chock.receiveShadow = true;
      group.add(chock);
    }

    const mossGeo = this.trackGeo(new THREE.DodecahedronGeometry(0.24, 0));
    const moss1 = new THREE.Mesh(mossGeo, this.mossMat);
    moss1.position.set(-0.38, 0.82, 0.14);
    moss1.scale.set(1.5, 0.55, 0.9);
    group.add(moss1);

    group.visible = false;
    this.parentGroup.add(group);
    return group;
  }

  private createArchGroup(): THREE.Group {
    const group = new THREE.Group();

    const plinthGeo = this.trackGeo(new THREE.BoxGeometry(0.56, 0.36, 0.86));
    const jambGeo = this.trackGeo(new THREE.BoxGeometry(0.42, 2.65, 0.68));

    for (const sx of [-1.08, 1.08]) {
      const plinth = new THREE.Mesh(plinthGeo, this.slateMat);
      plinth.position.set(sx, 0.18, 0);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      group.add(plinth);

      const jamb = new THREE.Mesh(jambGeo, this.pillarMat);
      jamb.position.set(sx, 1.65, 0);
      jamb.castShadow = true;
      jamb.receiveShadow = true;
      group.add(jamb);
    }

    const lintelGeo = this.trackGeo(new THREE.BoxGeometry(2.68, 1.05, 0.86));
    const lintel = new THREE.Mesh(lintelGeo, this.pillarMat);
    lintel.position.set(0, 1.88, 0);
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    group.add(lintel);

    const corniceGeo = this.trackGeo(new THREE.BoxGeometry(2.84, 0.28, 0.98));
    const cornice = new THREE.Mesh(corniceGeo, this.slateMat);
    cornice.position.set(0, 2.54, 0);
    cornice.castShadow = true;
    group.add(cornice);

    const goldStripGeo = this.trackGeo(new THREE.BoxGeometry(2.24, 0.12, 0.9));
    const goldStrip = new THREE.Mesh(goldStripGeo, this.goldTrimMat);
    goldStrip.position.set(0, 1.44, 0);
    group.add(goldStrip);

    const mossGeo = this.trackGeo(new THREE.DodecahedronGeometry(0.28, 0));
    for (const mx of [-0.68, 0.42]) {
      const moss = new THREE.Mesh(mossGeo, this.mossMat);
      moss.position.set(mx, 2.74, 0.12);
      moss.scale.set(1.6, 0.62, 1.1);
      group.add(moss);
    }

    group.visible = false;
    this.parentGroup.add(group);
    return group;
  }

  private createPillarGroup(): THREE.Group {
    const group = new THREE.Group();

    const plinthGeo = this.trackGeo(new THREE.BoxGeometry(1.74, 0.44, 1.74));
    const plinth = new THREE.Mesh(plinthGeo, this.slateMat);
    plinth.position.set(0, 0.22, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const shaftGeo = this.trackGeo(new THREE.CylinderGeometry(0.66, 0.76, 2.65, 8));
    const shaft = new THREE.Mesh(shaftGeo, this.pillarMat);
    shaft.position.set(0, 1.76, 0);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);

    const ringGeo = this.trackGeo(new THREE.CylinderGeometry(0.79, 0.79, 0.14, 8));
    const goldRing = new THREE.Mesh(ringGeo, this.goldTrimMat);
    goldRing.position.set(0, 2.45, 0);
    group.add(goldRing);

    const capGeo = this.trackGeo(new THREE.BoxGeometry(1.56, 0.48, 1.56));
    const cap = new THREE.Mesh(capGeo, this.slateMat);
    cap.position.set(0, 3.3, 0);
    cap.rotation.y = 0.15;
    cap.castShadow = true;
    group.add(cap);

    const mossGeo = this.trackGeo(new THREE.DodecahedronGeometry(0.45, 0));
    const moss = new THREE.Mesh(mossGeo, this.mossMat);
    moss.position.set(0.2, 3.65, -0.1);
    moss.scale.set(1.25, 0.55, 1.25);
    group.add(moss);

    group.visible = false;
    this.parentGroup.add(group);
    return group;
  }

  private createNairaGroup(denom: NairaDenomination): THREE.Group {
    const group = new THREE.Group();
    const mats = this.nairaMaterials.get(denom.value)!;
    const note = new THREE.Mesh(this.nairaGeo, mats);
    note.rotation.x = -0.18;
    note.castShadow = true;
    group.add(note);

    group.visible = false;
    this.parentGroup.add(group);
    return group;
  }

  private createPowerUpGroup(kind: PowerUpKind): THREE.Group {
    const group = new THREE.Group();

    if (kind === 'magnet') {
      // Jade Magnet: carved jade horseshoe arc + gold magnetic tips + glowing jade core
      const jadeMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: PALETTE.jadeRelic,
          emissive: 0x1a7858,
          emissiveIntensity: 0.45,
          roughness: 0.28,
          metalness: 0.45,
        })
      );
      const arcGeo = this.trackGeo(new THREE.TorusGeometry(0.42, 0.11, 10, 20, Math.PI * 1.25));
      const arc = new THREE.Mesh(arcGeo, jadeMat);
      arc.rotation.z = -Math.PI * 0.125;
      arc.castShadow = true;
      group.add(arc);

      const coreGeo = this.trackGeo(new THREE.OctahedronGeometry(0.18, 0));
      const core = new THREE.Mesh(coreGeo, this.goldTrimMat);
      group.add(core);
    } else if (kind === 'shield') {
      // Amber Aegis: faceted amber crystal octahedron + hammered gold ring
      const amberMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: PALETTE.amberRelic,
          emissive: 0xb85818,
          emissiveIntensity: 0.45,
          roughness: 0.18,
          metalness: 0.3,
        })
      );
      const crystalGeo = this.trackGeo(new THREE.OctahedronGeometry(0.42, 0));
      const crystal = new THREE.Mesh(crystalGeo, amberMat);
      crystal.scale.set(0.95, 1.2, 0.95);
      crystal.castShadow = true;
      group.add(crystal);

      const ringGeo = this.trackGeo(new THREE.TorusGeometry(0.55, 0.045, 8, 24));
      const ring = new THREE.Mesh(ringGeo, this.goldTrimMat);
      ring.rotation.x = Math.PI / 3;
      group.add(ring);
    } else {
      // Sunburst Dash: radiant golden sun-star crest + halo ring
      const sunMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: PALETTE.brightGold,
          emissive: 0xe68a2e,
          emissiveIntensity: 0.65,
          roughness: 0.18,
          metalness: 0.85,
        })
      );
      const starA = this.trackGeo(new THREE.OctahedronGeometry(0.4, 0));
      const meshA = new THREE.Mesh(starA, sunMat);
      meshA.scale.set(1.15, 1.15, 0.45);
      meshA.castShadow = true;
      group.add(meshA);

      const meshB = new THREE.Mesh(starA, sunMat);
      meshB.rotation.z = Math.PI / 4;
      meshB.scale.set(1.15, 1.15, 0.45);
      group.add(meshB);

      const haloGeo = this.trackGeo(new THREE.TorusGeometry(0.58, 0.04, 8, 24));
      const halo = new THREE.Mesh(haloGeo, this.goldTrimMat);
      group.add(halo);
    }

    group.visible = false;
    this.parentGroup.add(group);
    return group;
  }

  private spawnObstacle(kind: Exclude<ObstacleKind, 'gap'>, lane: number, z: number): void {
    const pool = kind === 'log' ? this.poolLog : kind === 'arch' ? this.poolArch : this.poolPillar;
    const mesh =
      pool.pop() ??
      (kind === 'log'
        ? this.createLogGroup()
        : kind === 'arch'
          ? this.createArchGroup()
          : this.createPillarGroup());

    const x = lane * GAME_CONFIG.laneWidth;
    mesh.position.set(x, 0, z);
    mesh.visible = true;

    let halfWidth = 0.85;
    let halfDepth = 0.45;
    let minY = 0;
    let maxY = 1.0;

    if (kind === 'log') {
      halfWidth = 1.0;
      halfDepth = 0.42;
      minY = 0;
      maxY = 0.86;
    } else if (kind === 'arch') {
      halfWidth = 1.02;
      halfDepth = 0.42;
      minY = 1.28;
      maxY = 2.8;
    } else {
      halfWidth = 0.72;
      halfDepth = 0.72;
      minY = 0;
      maxY = 3.6;
    }

    this.obstacles.push({
      id: this.nextId++,
      kind,
      lane,
      z,
      mesh,
      halfWidth,
      halfDepth,
      minY,
      maxY,
      nearMissChecked: false,
      hitHandled: false,
    });
  }

  private spawnGapHazard(zPos: number): boolean {
    const exactZ = this.world.assignGapNearZ(zPos);
    if (exactZ === null) return false;

    this.obstacles.push({
      id: this.nextId++,
      kind: 'gap',
      lane: 0,
      z: exactZ,
      mesh: null,
      halfWidth: GAME_CONFIG.causewayWidth * 0.5,
      halfDepth: 1.45,
      minY: -2,
      maxY: 0.25,
      nearMissChecked: false,
      hitHandled: false,
    });

    // Place a 3-coin jump arc over the center lane (plus side hints) across the broken bridge
    const arcLane = Math.floor(this.rng() * 3) - 1;
    this.spawnJumpArcCoins(arcLane, exactZ);
    return true;
  }

  private pickNairaDenomination(): NairaDenomination {
    return NAIRA_DENOMINATIONS[0]; // Always ₦10
  }

  private spawnCoin(lane: number, y: number, z: number, denom?: NairaDenomination): void {
    const chosen = denom ?? this.pickNairaDenomination();
    const pool = this.poolNaira.get(chosen.value);
    const mesh = pool?.pop() ?? this.createNairaGroup(chosen);
    const x = lane * GAME_CONFIG.laneWidth;
    mesh.position.set(x, y, z);
    mesh.visible = true;

    this.coins.push({
      id: this.nextId++,
      value: chosen.value,
      x,
      baseY: y,
      z,
      collected: false,
      magnetized: false,
      mesh,
      phase: z * 0.22,
    });
  }

  private spawnPowerUp(kind: PowerUpKind, lane: number, y: number, z: number): void {
    const pool =
      kind === 'magnet' ? this.poolMagnet : kind === 'shield' ? this.poolShield : this.poolDash;
    const mesh = pool.pop() ?? this.createPowerUpGroup(kind);
    const x = lane * GAME_CONFIG.laneWidth;
    mesh.position.set(x, y, z);
    mesh.visible = true;

    this.powerUps.push({
      id: this.nextId++,
      kind,
      x,
      baseY: y,
      z,
      collected: false,
      mesh,
      phase: z * 0.17,
    });
  }

  private spawnJumpArcCoins(lane: number, logZ: number): void {
    const tenNaira = this.pickNairaDenomination();
    this.spawnCoin(lane, 1.38, logZ + 2.35, tenNaira);
    this.spawnCoin(lane, 2.05, logZ, tenNaira);
    this.spawnCoin(lane, 1.38, logZ - 2.35, tenNaira);
  }

  private spawnSlideLineCoins(lane: number, archZ: number): void {
    const tenNaira = this.pickNairaDenomination();
    this.spawnCoin(lane, 0.55, archZ + 2.2, tenNaira);
    this.spawnCoin(lane, 0.55, archZ, tenNaira);
    this.spawnCoin(lane, 0.55, archZ - 2.2, tenNaira);
  }

  private spawnSafeTrailCoins(lane: number, startZ: number, count: number, stepZ = 2.4): void {
    const tenNaira = this.pickNairaDenomination();
    for (let i = 0; i < count; i++) {
      this.spawnCoin(lane, 0.85, startZ - i * stepZ, tenNaira);
    }
  }

  private pickPowerUpKind(): PowerUpKind {
    const r = this.rng();
    if (r < 0.38) return 'magnet';
    if (r < 0.72) return 'shield';
    return 'dash';
  }

  private emitNextWave(speed: number, biome: BiomeId): void {
    // If a 90-degree junction is already ahead, pause straight obstacle spawning until after the turn
    if (this.world.getActiveJunction()) {
      return;
    }

    const z = this.nextSpawnZ;
    const speedFactor = THREE.MathUtils.clamp((speed - GAME_CONFIG.baseSpeed) / 14, 0, 1);
    const gap = 25 + speedFactor * 11;

    // Trigger a 90-degree Temple Turn every 6-8 waves!
    if (this.wavesSinceTurn >= 6 + Math.floor(this.rng() * 3)) {
      this.wavesSinceTurn = 0;
      const turnChoices: TurnKind[] = ['left', 'right', 'tee'];
      const kind = turnChoices[Math.floor(this.rng() * turnChoices.length)];
      const junctionZ = z - 16; // Leave a clean 16m runway before the corner!
      this.world.spawnJunction(kind, junctionZ);
      this.nextSpawnZ = junctionZ - 24;
      return;
    }

    this.wavesSinceTurn++;
    this.wavesSincePowerUp++;

    // In Aqueducts biome (500-1000m), periodically introduce Broken Bridge Gaps!
    if (biome === 'aqueduct' && this.waveIndex % 4 === 2) {
      if (this.spawnGapHazard(z)) {
        // Occasionally float a risky Relic Power-Up right above a side lane of the broken bridge!
        if (this.wavesSincePowerUp >= 4) {
          this.wavesSincePowerUp = 0;
          const riskyLane = Math.floor(this.rng() * 3) - 1;
          this.spawnPowerUp(this.pickPowerUpKind(), riskyLane, 2.15, z);
        }
        this.waveIndex++;
        this.nextSpawnZ = z - (gap + 4);
        return;
      }
    }

    const lanes = [-1, 0, 1];
    const adjacentLanes = lanes.filter((l) => Math.abs(l - this.lastSafeLane) <= 1);
    const safeLane = adjacentLanes[Math.floor(this.rng() * adjacentLanes.length)];
    const otherLanes = lanes.filter((l) => l !== safeLane);

    // Risky power-up placement every ~4-5 waves
    const shouldPlacePowerUp = this.wavesSincePowerUp >= 4 + Math.floor(this.rng() * 2);

    const patternId = this.waveIndex % 7;
    this.waveIndex++;

    switch (patternId) {
      case 0: {
        this.spawnObstacle('log', safeLane, z);
        if (shouldPlacePowerUp) {
          this.wavesSincePowerUp = 0;
          this.spawnPowerUp(this.pickPowerUpKind(), safeLane, 2.05, z);
        } else {
          this.spawnJumpArcCoins(safeLane, z);
        }
        this.spawnObstacle('pillar', otherLanes[0], z - 2.5);
        this.nextSpawnZ = z - gap;
        break;
      }
      case 1: {
        this.spawnObstacle('arch', safeLane, z);
        this.spawnSlideLineCoins(safeLane, z);
        this.spawnObstacle('log', otherLanes[1], z);
        if (shouldPlacePowerUp) {
          this.wavesSincePowerUp = 0;
          // Risky lane: high jump over side log for relic!
          this.spawnPowerUp(this.pickPowerUpKind(), otherLanes[1], 2.05, z);
        }
        this.nextSpawnZ = z - gap;
        break;
      }
      case 2: {
        this.spawnObstacle('pillar', otherLanes[0], z);
        this.spawnObstacle('pillar', otherLanes[1], z);
        this.spawnSafeTrailCoins(safeLane, z + 3, 4, 2.5);

        const nextSafe = lanes.find((l) => l !== safeLane) ?? 0;
        for (const l of lanes) {
          if (l !== nextSafe) {
            this.spawnObstacle('pillar', l, z - 16);
          }
        }
        if (shouldPlacePowerUp) {
          this.wavesSincePowerUp = 0;
          this.spawnPowerUp(this.pickPowerUpKind(), nextSafe, 1.05, z - 16);
        } else {
          this.spawnSafeTrailCoins(nextSafe, z - 13, 3, 2.5);
        }
        this.lastSafeLane = nextSafe;
        this.nextSpawnZ = z - (gap + 16);
        return;
      }
      case 3: {
        this.spawnObstacle('log', safeLane, z);
        this.spawnJumpArcCoins(safeLane, z);

        const comboGap = 17 + speedFactor * 4.5;
        this.spawnObstacle('arch', safeLane, z - comboGap);
        if (shouldPlacePowerUp) {
          this.wavesSincePowerUp = 0;
          this.spawnPowerUp(this.pickPowerUpKind(), safeLane, 0.72, z - comboGap);
        } else {
          this.spawnSlideLineCoins(safeLane, z - comboGap);
        }

        this.spawnObstacle('pillar', otherLanes[0], z - comboGap * 0.5);
        this.nextSpawnZ = z - (comboGap + gap * 0.85);
        break;
      }
      case 4: {
        this.spawnObstacle('log', safeLane, z);
        this.spawnJumpArcCoins(safeLane, z);
        this.spawnObstacle('log', otherLanes[0], z);
        if (shouldPlacePowerUp) {
          this.wavesSincePowerUp = 0;
          this.spawnPowerUp(this.pickPowerUpKind(), otherLanes[0], 2.05, z);
        } else {
          this.spawnJumpArcCoins(otherLanes[0], z);
        }
        this.spawnObstacle('pillar', otherLanes[1], z);
        this.nextSpawnZ = z - gap;
        break;
      }
      case 5: {
        for (const l of lanes) {
          this.spawnObstacle('arch', l, z);
        }
        this.spawnSlideLineCoins(safeLane, z);
        if (shouldPlacePowerUp) {
          this.wavesSincePowerUp = 0;
          this.spawnPowerUp(this.pickPowerUpKind(), otherLanes[0], 0.72, z);
        }
        this.nextSpawnZ = z - (gap + 3);
        break;
      }
      default: {
        this.spawnObstacle('pillar', otherLanes[0], z);
        this.spawnObstacle('arch', otherLanes[1], z);
        this.spawnSafeTrailCoins(safeLane, z + 2.5, 4, 2.4);
        if (shouldPlacePowerUp) {
          this.wavesSincePowerUp = 0;
          this.spawnPowerUp(this.pickPowerUpKind(), otherLanes[1], 0.72, z);
        }
        this.nextSpawnZ = z - gap;
        break;
      }
    }

    this.lastSafeLane = safeLane;
  }

  public clearAfterTurn(): void {
    this.recycleAllActiveEntities();
    this.nextSpawnZ = -40;
  }

  public update(
    dt: number,
    speed: number,
    elapsed: number,
    previewMode: boolean,
    biome: BiomeId,
    magnetActive: boolean,
    playerX: number,
    playerY: number
  ): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += speed * dt;
      if (obs.mesh) {
        obs.mesh.position.z = obs.z;
      }

      if (obs.z > 16) {
        if (obs.mesh) {
          obs.mesh.visible = false;
          if (obs.kind === 'log') this.poolLog.push(obs.mesh);
          else if (obs.kind === 'arch') this.poolArch.push(obs.mesh);
          else if (obs.kind === 'pillar') this.poolPillar.push(obs.mesh);
        }
        this.obstacles.splice(i, 1);
      }
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.z += speed * dt;

      // Jade Magnet / Sunburst Dash pulls nearby coins across all 3 lanes into the explorer!
      if (magnetActive && !coin.collected && coin.z > -18 && coin.z < 3.5) {
        coin.magnetized = true;
      }
      if (coin.magnetized && !coin.collected) {
        const pull = 1 - Math.exp(-16 * dt);
        coin.x = THREE.MathUtils.lerp(coin.x, playerX, pull);
        coin.baseY = THREE.MathUtils.lerp(coin.baseY, playerY + 1.0, pull);
        coin.z = THREE.MathUtils.lerp(coin.z, 0, pull * 0.85);
      }

      coin.mesh.position.set(
        coin.x,
        coin.baseY + Math.sin(elapsed * 4.2 + coin.phase) * 0.09,
        coin.z
      );
      coin.mesh.rotation.y = Math.sin(elapsed * 2.5 + coin.phase) * 0.55 + elapsed * 1.4;

      if (coin.z > 14 || coin.collected) {
        coin.mesh.visible = false;
        this.poolNaira.get(coin.value)?.push(coin.mesh);
        this.coins.splice(i, 1);
      }
    }

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.z += speed * dt;
      pu.mesh.position.set(pu.x, pu.baseY + Math.sin(elapsed * 3.6 + pu.phase) * 0.14, pu.z);
      pu.mesh.rotation.y = elapsed * 2.4 + pu.phase;

      if (pu.z > 14 || pu.collected) {
        pu.mesh.visible = false;
        if (pu.kind === 'magnet') this.poolMagnet.push(pu.mesh);
        else if (pu.kind === 'shield') this.poolShield.push(pu.mesh);
        else this.poolDash.push(pu.mesh);
        this.powerUps.splice(i, 1);
      }
    }

    if (!previewMode && !this.world.getActiveJunction()) {
      this.nextSpawnZ += speed * dt;
      while (this.nextSpawnZ > -115 && !this.world.getActiveJunction()) {
        this.emitNextWave(speed, biome);
      }
    }
  }

  public getObstacles(): readonly ActiveObstacle[] {
    return this.obstacles;
  }

  public getCoins(): readonly ActiveCoin[] {
    return this.coins;
  }

  public getPowerUps(): readonly ActivePowerUp[] {
    return this.powerUps;
  }

  private recycleAllActiveEntities(): void {
    for (const obs of this.obstacles) {
      if (obs.mesh) {
        obs.mesh.visible = false;
        if (obs.kind === 'log') this.poolLog.push(obs.mesh);
        else if (obs.kind === 'arch') this.poolArch.push(obs.mesh);
        else if (obs.kind === 'pillar') this.poolPillar.push(obs.mesh);
      }
    }
    this.obstacles.length = 0;

    for (const coin of this.coins) {
      coin.mesh.visible = false;
      this.poolNaira.get(coin.value)?.push(coin.mesh);
    }
    this.coins.length = 0;

    for (const pu of this.powerUps) {
      pu.mesh.visible = false;
      if (pu.kind === 'magnet') this.poolMagnet.push(pu.mesh);
      else if (pu.kind === 'shield') this.poolShield.push(pu.mesh);
      else this.poolDash.push(pu.mesh);
    }
    this.powerUps.length = 0;
  }

  public reset(): void {
    this.recycleAllActiveEntities();
    this.nextSpawnZ = -42;
    this.lastSafeLane = 0;
    this.waveIndex = 0;
    this.wavesSinceTurn = 0;
    this.wavesSincePowerUp = 1;
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
