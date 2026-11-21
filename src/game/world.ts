import * as THREE from 'three';
import { BIOMES, GAME_CONFIG, PALETTE, type BiomeDefinition, type TurnKind } from './palette';
import type { ParticlePool } from './particles';
import type { ProceduralTextureSet } from './textures';

interface CausewaySegment {
  group: THREE.Group;
  solidDeck: THREE.Mesh;
  gapDeckGroup: THREE.Group;
  vines: THREE.Group[];
  flames: THREE.Mesh[];
  brazierPositions: Array<{ x: number; y: number; z: number }>;
  hasGap: boolean;
  zCenter: number;
}

export interface ActiveJunction {
  kind: TurnKind;
  z: number;
  resolved: boolean;
}

export class RuinWorld {
  public readonly worldPivot = new THREE.Group();

  private readonly segments: CausewaySegment[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private readonly waterMesh: THREE.Mesh;
  private readonly waterMat: THREE.MeshStandardMaterial;
  private readonly waterBump: THREE.Texture;

  private readonly ambientMotes: THREE.Points;
  private readonly motePositions: Float32Array;
  private readonly moteMat: THREE.PointsMaterial;
  private readonly moteCount = 140;

  // Biome-tinted shared materials
  private readonly floorMat: THREE.MeshStandardMaterial;
  private readonly pillarMat: THREE.MeshStandardMaterial;
  private readonly distantRuinMat: THREE.MeshStandardMaterial;
  private readonly canyonMat: THREE.MeshStandardMaterial;
  private readonly flameMat: THREE.MeshBasicMaterial;
  private readonly vaultPointLight: THREE.PointLight;

  // 90-degree Temple Junction Group (reused whenever a turn approaches)
  private readonly junctionGroup = new THREE.Group();
  private readonly leftBranchGroup = new THREE.Group();
  private readonly rightBranchGroup = new THREE.Group();
  private readonly leftChevronGroup = new THREE.Group();
  private readonly rightChevronGroup = new THREE.Group();
  private readonly arrowGlowMat: THREE.MeshStandardMaterial;
  private activeJunction: ActiveJunction | null = null;

  private readonly totalLength = GAME_CONFIG.segmentLength * GAME_CONFIG.segmentCount;
  private emberAccum = 0;

  // Scratch colors for smooth biome interpolation
  private readonly tmpColorA = new THREE.Color();
  private readonly tmpColorB = new THREE.Color();

  constructor(scene: THREE.Scene, textures: ProceduralTextureSet) {
    scene.add(this.worldPivot);

    this.waterBump = textures.waterBump;

    this.floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.sandstoneMap,
        bumpMap: textures.sandstoneBump,
        bumpScale: 0.045,
        roughnessMap: textures.sandstoneRoughness,
        roughness: 0.9,
        metalness: 0.04,
      })
    );

    this.pillarMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.pillarMap,
        bumpMap: textures.pillarBump,
        bumpScale: 0.06,
        roughness: 0.85,
        metalness: 0.05,
      })
    );

    const slateTrimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.shadowSlate,
        roughness: 0.72,
        metalness: 0.14,
      })
    );

    const mossMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.mossGreen,
        roughness: 0.94,
        metalness: 0.0,
      })
    );

    const vineMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.mossDark,
        roughness: 0.9,
        metalness: 0.0,
      })
    );

    const goldInlayMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.hammeredGold,
        roughness: 0.4,
        metalness: 0.72,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );

    this.arrowGlowMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.brightGold,
        emissive: PALETTE.hammeredGold,
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );

    this.canyonMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b5856,
        roughness: 0.98,
        metalness: 0.0,
      })
    );

    this.distantRuinMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xb98a62,
        roughness: 0.92,
        metalness: 0.02,
      })
    );

    this.flameMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffaa44,
      })
    );

    // Wide canyon floor extending to horizon
    const abyssGeo = this.trackGeo(new THREE.PlaneGeometry(360, 380));
    const abyssFloor = new THREE.Mesh(abyssGeo, this.canyonMat);
    abyssFloor.rotation.x = -Math.PI / 2;
    abyssFloor.position.set(0, -11.5, -110);
    scene.add(abyssFloor);

    // Flooded Aqueducts shimmering turquoise water reflection plane
    const waterGeo = this.trackGeo(new THREE.PlaneGeometry(340, 360));
    this.waterMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x267577,
        emissive: 0x103c42,
        emissiveIntensity: 0.35,
        bumpMap: textures.waterBump,
        bumpScale: 0.08,
        roughness: 0.14,
        metalness: 0.72,
        transparent: true,
        opacity: 0.0,
      })
    );
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(0, -4.6, -100);
    this.waterMesh.visible = false;
    scene.add(this.waterMesh);

    // Warm vault torch point light near runner
    this.vaultPointLight = new THREE.PointLight(0xff8c3a, 0, 28, 1.5);
    this.vaultPointLight.position.set(0, 3.6, -6);
    scene.add(this.vaultPointLight);

    // Shared geometries for causeway segments
    const segLen = GAME_CONFIG.segmentLength;
    const deckGeo = this.trackGeo(new THREE.BoxGeometry(GAME_CONFIG.causewayWidth, 1.4, segLen));
    const halfDeckLen = (segLen - 3.8) * 0.5; // leaves 3.8m open bridge gap in the center
    const halfDeckGeo = this.trackGeo(new THREE.BoxGeometry(GAME_CONFIG.causewayWidth, 1.4, halfDeckLen));
    const gapLipGeo = this.trackGeo(new THREE.BoxGeometry(GAME_CONFIG.causewayWidth * 0.94, 0.22, 0.38));

    const curbGeo = this.trackGeo(new THREE.BoxGeometry(0.65, 0.42, segLen));
    const laneStripGeo = this.trackGeo(new THREE.BoxGeometry(0.11, 0.03, segLen));
    const buttressGeo = this.trackGeo(new THREE.BoxGeometry(1.4, 12.0, 2.2));
    const wallLowGeo = this.trackGeo(new THREE.BoxGeometry(0.75, 1.5, 4.4));
    const wallTopCapGeo = this.trackGeo(new THREE.BoxGeometry(0.95, 0.28, 4.6));

    const plinthGeo = this.trackGeo(new THREE.BoxGeometry(1.75, 0.9, 1.75));
    const colShaftTallGeo = this.trackGeo(new THREE.CylinderGeometry(0.58, 0.68, 8.2, 10));
    const colShaftBrokenGeo = this.trackGeo(new THREE.CylinderGeometry(0.6, 0.68, 4.2, 10));
    const capitalGeo = this.trackGeo(new THREE.BoxGeometry(1.65, 0.65, 1.65));
    const mossCapGeo = this.trackGeo(new THREE.DodecahedronGeometry(0.55, 0));
    const lintelBeamGeo = this.trackGeo(new THREE.BoxGeometry(14.8, 1.15, 1.45));

    // Brazier parts (bowl + flame cone)
    const brazierBowlGeo = this.trackGeo(new THREE.CylinderGeometry(0.36, 0.16, 0.26, 8));
    const flameGeo = this.trackGeo(new THREE.ConeGeometry(0.2, 0.58, 7));

    const vineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.12, -1.3, 0.1),
      new THREE.Vector3(-0.08, -2.7, -0.08),
      new THREE.Vector3(0.06, -4.1, 0.05),
    ]);
    const vineTubeGeo = this.trackGeo(new THREE.TubeGeometry(vineCurve, 12, 0.055, 5, false));
    const leafClusterGeo = this.trackGeo(new THREE.DodecahedronGeometry(0.24, 0));

    const zigguratBaseGeo = this.trackGeo(new THREE.BoxGeometry(16, 18, 14));
    const zigguratMidGeo = this.trackGeo(new THREE.BoxGeometry(11, 10, 10));
    const zigguratTopGeo = this.trackGeo(new THREE.BoxGeometry(6.5, 6, 6.5));

    for (let i = 0; i < GAME_CONFIG.segmentCount; i++) {
      const group = new THREE.Group();
      const zCenter = 12 - i * segLen;
      group.position.set(0, 0, zCenter);

      const vines: THREE.Group[] = [];
      const flames: THREE.Mesh[] = [];
      const brazierPositions: Array<{ x: number; y: number; z: number }> = [];

      // Solid Deck
      const solidDeck = new THREE.Mesh(deckGeo, this.floorMat);
      solidDeck.position.set(0, -0.7, 0);
      solidDeck.receiveShadow = true;
      group.add(solidDeck);

      // Broken-Bridge Gap Deck (visible only when segment hasGap === true)
      const gapDeckGroup = new THREE.Group();
      for (const sideZ of [-1, 1]) {
        const halfMesh = new THREE.Mesh(halfDeckGeo, this.floorMat);
        halfMesh.position.set(0, -0.7, sideZ * (1.9 + halfDeckLen * 0.5));
        halfMesh.receiveShadow = true;
        gapDeckGroup.add(halfMesh);

        const lip = new THREE.Mesh(gapLipGeo, goldInlayMat);
        lip.position.set(0, -0.04, sideZ * 2.02);
        gapDeckGroup.add(lip);
      }
      gapDeckGroup.visible = false;
      group.add(gapDeckGroup);

      // Curbs & lane seam strips
      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(curbGeo, this.pillarMat);
        curb.position.set(side * (GAME_CONFIG.causewayWidth * 0.5 - 0.32), 0.19, 0);
        curb.receiveShadow = true;
        curb.castShadow = true;
        group.add(curb);

        const trim = new THREE.Mesh(laneStripGeo, slateTrimMat);
        trim.position.set(side * (GAME_CONFIG.causewayWidth * 0.5 - 0.72), 0.02, 0);
        group.add(trim);
      }

      for (const laneEdge of [-GAME_CONFIG.laneWidth * 0.5, GAME_CONFIG.laneWidth * 0.5]) {
        const guide = new THREE.Mesh(laneStripGeo, goldInlayMat);
        guide.position.set(laneEdge, 0.018, 0);
        guide.receiveShadow = true;
        group.add(guide);
      }

      // Buttresses
      for (const bz of [-segLen * 0.25, segLen * 0.25]) {
        for (const side of [-1, 1]) {
          const buttress = new THREE.Mesh(buttressGeo, slateTrimMat);
          buttress.position.set(side * (GAME_CONFIG.causewayWidth * 0.5 - 0.8), -6.7, bz);
          group.add(buttress);
        }
      }

      // Parapet walls & wall braziers
      for (let w = 0; w < 2; w++) {
        const side = (i + w) % 2 === 0 ? -1 : 1;
        const wz = -segLen * 0.25 + w * (segLen * 0.52);
        const wx = side * (GAME_CONFIG.causewayWidth * 0.5 + 0.22);
        const wall = new THREE.Mesh(wallLowGeo, this.pillarMat);
        wall.position.set(wx, 0.75, wz);
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);

        const cap = new THREE.Mesh(wallTopCapGeo, slateTrimMat);
        cap.position.set(wx, 1.56, wz);
        cap.castShadow = true;
        group.add(cap);

        const moss = new THREE.Mesh(mossCapGeo, mossMat);
        moss.position.set(wx + side * 0.03, 1.72, wz + 0.8);
        moss.scale.set(1.2, 0.55, 1.5);
        group.add(moss);

        // Brazier bowl & flame on wall cap
        const bowl = new THREE.Mesh(brazierBowlGeo, goldInlayMat);
        bowl.position.set(wx, 1.82, wz - 0.6);
        group.add(bowl);

        const flame = new THREE.Mesh(flameGeo, this.flameMat);
        flame.position.set(wx, 2.18, wz - 0.6);
        flame.visible = false;
        group.add(flame);
        flames.push(flame);
        brazierPositions.push({ x: wx, y: 2.35, z: wz - 0.6 });
      }

      // Columns & overhead aqueduct lintels
      for (let c = 0; c < 2; c++) {
        const cz = -segLen * 0.3 + c * (segLen * 0.6);
        const hasBridge = i % 2 === 1 && c === 0;

        for (const side of [-1, 1]) {
          const isBroken = !hasBridge && (i + c + (side > 0 ? 1 : 0)) % 3 === 0;
          const colX = side * 6.55;
          const colGroup = new THREE.Group();
          colGroup.position.set(colX, -0.3, cz);

          const plinth = new THREE.Mesh(plinthGeo, slateTrimMat);
          plinth.position.set(0, 0.45, 0);
          plinth.castShadow = true;
          plinth.receiveShadow = true;
          colGroup.add(plinth);

          if (isBroken) {
            const brokenShaft = new THREE.Mesh(colShaftBrokenGeo, this.pillarMat);
            brokenShaft.position.set(0, 2.9, 0);
            brokenShaft.rotation.z = side * 0.04;
            brokenShaft.castShadow = true;
            brokenShaft.receiveShadow = true;
            colGroup.add(brokenShaft);

            const topMoss = new THREE.Mesh(mossCapGeo, mossMat);
            topMoss.position.set(0, 5.05, 0);
            topMoss.scale.set(1.15, 0.65, 1.15);
            colGroup.add(topMoss);
          } else {
            const tallShaft = new THREE.Mesh(colShaftTallGeo, this.pillarMat);
            tallShaft.position.set(0, 4.9, 0);
            tallShaft.castShadow = true;
            tallShaft.receiveShadow = true;
            colGroup.add(tallShaft);

            const cap = new THREE.Mesh(capitalGeo, slateTrimMat);
            cap.position.set(0, 9.2, 0);
            cap.castShadow = true;
            colGroup.add(cap);
          }

          group.add(colGroup);
        }

        if (hasBridge) {
          const lintel = new THREE.Mesh(lintelBeamGeo, this.pillarMat);
          lintel.position.set(0, 9.6, cz);
          lintel.castShadow = true;
          group.add(lintel);

          for (let v = -2; v <= 2; v++) {
            if (v === 0) continue;
            const vineGroup = new THREE.Group();
            vineGroup.position.set(v * 2.2 + (v > 0 ? 0.5 : -0.5), 9.1, cz + (v % 2) * 0.35);
            const vineMesh = new THREE.Mesh(vineTubeGeo, vineMat);
            vineGroup.add(vineMesh);

            for (let l = 1; l <= 3; l++) {
              const leaf = new THREE.Mesh(leafClusterGeo, mossMat);
              leaf.position.set(l % 2 === 0 ? 0.14 : -0.14, -l * 1.15, 0);
              leaf.scale.set(1.1, 0.75, 1.1);
              vineGroup.add(leaf);
            }

            const scaleLen = 0.72 + ((Math.abs(v) + i) % 3) * 0.2;
            vineGroup.scale.set(1, scaleLen, 1);
            group.add(vineGroup);
            vines.push(vineGroup);
          }
        }
      }

      // Distant parallax monoliths
      const outerSide = i % 2 === 0 ? -1 : 1;
      const monoGroup = new THREE.Group();
      monoGroup.position.set(outerSide * (24 + (i % 3) * 5.5), -11.5, 0);

      const base = new THREE.Mesh(zigguratBaseGeo, this.distantRuinMat);
      base.position.set(0, 9, 0);
      monoGroup.add(base);

      const mid = new THREE.Mesh(zigguratMidGeo, this.pillarMat);
      mid.position.set(0, 23, 0);
      monoGroup.add(mid);

      if (i % 3 !== 2) {
        const top = new THREE.Mesh(zigguratTopGeo, this.distantRuinMat);
        top.position.set(0, 31, 0);
        monoGroup.add(top);
      }

      const terraceMoss = new THREE.Mesh(mossCapGeo, mossMat);
      terraceMoss.position.set(-outerSide * 4.5, 18.2, 2);
      terraceMoss.scale.set(3.2, 1.2, 3.8);
      monoGroup.add(terraceMoss);
      group.add(monoGroup);

      const farCol = new THREE.Group();
      farCol.position.set(-outerSide * 15.5, -9.5, -segLen * 0.25);
      const farShaft = new THREE.Mesh(colShaftTallGeo, this.distantRuinMat);
      farShaft.position.set(0, 8.5, 0);
      farShaft.scale.set(1.6, 2.2, 1.6);
      farCol.add(farShaft);
      group.add(farCol);

      this.worldPivot.add(group);
      this.segments.push({
        group,
        solidDeck,
        gapDeckGroup,
        vines,
        flames,
        brazierPositions,
        hasGap: false,
        zCenter,
      });
    }

    // Build reusable 90-degree Temple Junction Plaza + Left/Right Branches
    this.buildJunctionGroup(slateTrimMat, goldInlayMat, colShaftTallGeo, plinthGeo, capitalGeo);

    // Floating sunlit dust / ember motes
    this.motePositions = new Float32Array(this.moteCount * 3);
    for (let m = 0; m < this.moteCount; m++) {
      this.motePositions[m * 3] = (Math.random() - 0.5) * 20;
      this.motePositions[m * 3 + 1] = 0.6 + Math.random() * 8.5;
      this.motePositions[m * 3 + 2] = 10 - Math.random() * 95;
    }
    const moteGeo = this.trackGeo(new THREE.BufferGeometry());
    moteGeo.setAttribute('position', new THREE.BufferAttribute(this.motePositions, 3));
    this.moteMat = this.trackMat(
      new THREE.PointsMaterial({
        size: 0.22,
        map: textures.particleMap,
        color: PALETTE.brightGold,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.ambientMotes = new THREE.Points(moteGeo, this.moteMat);
    this.ambientMotes.frustumCulled = false;
    scene.add(this.ambientMotes);
  }

  private buildJunctionGroup(
    slateTrimMat: THREE.Material,
    goldInlayMat: THREE.Material,
    colShaftGeo: THREE.BufferGeometry,
    plinthGeo: THREE.BufferGeometry,
    capitalGeo: THREE.BufferGeometry
  ): void {
    const w = GAME_CONFIG.causewayWidth;
    // Central 9.2 x 9.2 stone plaza
    const plazaGeo = this.trackGeo(new THREE.BoxGeometry(w, 1.4, w));
    const plazaMesh = new THREE.Mesh(plazaGeo, this.floorMat);
    plazaMesh.position.set(0, -0.7, 0);
    plazaMesh.receiveShadow = true;
    this.junctionGroup.add(plazaMesh);

    // Far parapet wall blocking straight ahead (-Z edge of plaza)
    const wallGeo = this.trackGeo(new THREE.BoxGeometry(w + 1.2, 1.65, 0.85));
    const backWall = new THREE.Mesh(wallGeo, this.pillarMat);
    backWall.position.set(0, 0.82, -w * 0.5 - 0.25);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    this.junctionGroup.add(backWall);

    const wallCapGeo = this.trackGeo(new THREE.BoxGeometry(w + 1.5, 0.3, 1.05));
    const backCap = new THREE.Mesh(wallCapGeo, slateTrimMat);
    backCap.position.set(0, 1.78, -w * 0.5 - 0.25);
    this.junctionGroup.add(backCap);

    // Corner columns framing the junction
    for (const sx of [-1, 1]) {
      const col = new THREE.Group();
      col.position.set(sx * 6.55, -0.3, -w * 0.5);
      const pl = new THREE.Mesh(plinthGeo, slateTrimMat);
      pl.position.y = 0.45;
      col.add(pl);
      const sh = new THREE.Mesh(colShaftGeo, this.pillarMat);
      sh.position.y = 4.9;
      sh.castShadow = true;
      col.add(sh);
      const cp = new THREE.Mesh(capitalGeo, slateTrimMat);
      cp.position.y = 9.2;
      col.add(cp);
      this.junctionGroup.add(col);
    }

    // Glowing inlaid directional chevron arrows on the stone floor
    const buildChevron = (dir: -1 | 1, target: THREE.Group) => {
      const barGeo = this.trackGeo(new THREE.BoxGeometry(1.1, 0.04, 0.26));
      for (const offset of [0, 1.35]) {
        const b1 = new THREE.Mesh(barGeo, this.arrowGlowMat);
        b1.position.set(dir * (0.95 + offset), 0.028, -0.36);
        b1.rotation.y = dir * -0.58;
        target.add(b1);

        const b2 = new THREE.Mesh(barGeo, this.arrowGlowMat);
        b2.position.set(dir * (0.95 + offset), 0.028, 0.36);
        b2.rotation.y = dir * 0.58;
        target.add(b2);
      }
      this.junctionGroup.add(target);
    };
    buildChevron(-1, this.leftChevronGroup);
    buildChevron(1, this.rightChevronGroup);

    // Perpendicular corridor branch builder (extends 96m along -X or +X)
    const branchLen = 96;
    const branchDeckGeo = this.trackGeo(new THREE.BoxGeometry(branchLen, 1.4, w));
    const branchCurbGeo = this.trackGeo(new THREE.BoxGeometry(branchLen, 0.42, 0.65));
    const branchLaneGeo = this.trackGeo(new THREE.BoxGeometry(branchLen, 0.03, 0.11));

    const buildBranch = (dir: -1 | 1, branchGroup: THREE.Group) => {
      const cx = dir * (w * 0.5 + branchLen * 0.5);
      const deck = new THREE.Mesh(branchDeckGeo, this.floorMat);
      deck.position.set(cx, -0.7, 0);
      deck.receiveShadow = true;
      branchGroup.add(deck);

      for (const sideZ of [-1, 1]) {
        const curb = new THREE.Mesh(branchCurbGeo, this.pillarMat);
        curb.position.set(cx, 0.19, sideZ * (w * 0.5 - 0.32));
        curb.receiveShadow = true;
        branchGroup.add(curb);
      }

      for (const laneEdge of [-GAME_CONFIG.laneWidth * 0.5, GAME_CONFIG.laneWidth * 0.5]) {
        const strip = new THREE.Mesh(branchLaneGeo, goldInlayMat);
        strip.position.set(cx, 0.02, laneEdge);
        branchGroup.add(strip);
      }

      // Flanking columns along the branch so it looks deep into the mist
      for (let k = 1; k <= 5; k++) {
        const bx = dir * (w * 0.5 + k * 16);
        for (const sideZ of [-1, 1]) {
          const col = new THREE.Group();
          col.position.set(bx, -0.3, sideZ * 6.55);
          const pl = new THREE.Mesh(plinthGeo, slateTrimMat);
          pl.position.y = 0.45;
          col.add(pl);
          const sh = new THREE.Mesh(colShaftGeo, this.pillarMat);
          sh.position.y = 4.9;
          col.add(sh);
          branchGroup.add(col);
        }
      }

      this.junctionGroup.add(branchGroup);
    };

    buildBranch(-1, this.leftBranchGroup);
    buildBranch(1, this.rightBranchGroup);

    this.junctionGroup.visible = false;
    this.worldPivot.add(this.junctionGroup);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  public spawnJunction(kind: TurnKind, zPos: number): void {
    this.activeJunction = { kind, z: zPos, resolved: false };
    this.junctionGroup.position.set(0, 0, zPos);
    this.junctionGroup.visible = true;

    const showLeft = kind === 'left' || kind === 'tee';
    const showRight = kind === 'right' || kind === 'tee';
    this.leftBranchGroup.visible = showLeft;
    this.leftChevronGroup.visible = showLeft;
    this.rightBranchGroup.visible = showRight;
    this.rightChevronGroup.visible = showRight;
  }

  public getActiveJunction(): ActiveJunction | null {
    return this.activeJunction;
  }

  public clearJunctionAndRebaseSegments(): void {
    this.activeJunction = null;
    this.junctionGroup.visible = false;
    this.worldPivot.position.set(0, 0, 0);
    this.worldPivot.rotation.set(0, 0, 0);

    const segLen = GAME_CONFIG.segmentLength;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.zCenter = 12 - i * segLen;
      seg.group.position.set(0, 0, seg.zCenter);
      seg.group.visible = true;
      this.setSegmentGap(seg, false);
    }
  }

  private setSegmentGap(seg: CausewaySegment, hasGap: boolean): void {
    seg.hasGap = hasGap;
    seg.solidDeck.visible = !hasGap;
    seg.gapDeckGroup.visible = hasGap;
  }

  /**
   * Aligns the closest upcoming segment near targetZ to display a Broken Bridge Gap.
   * Returns the exact world Z center of the gap so the obstacle hitbox aligns 1:1.
   */
  public assignGapNearZ(targetZ: number): number | null {
    let best: CausewaySegment | null = null;
    let bestDiff = Infinity;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (!seg.group.visible || seg.hasGap) continue;
      if (this.activeJunction && seg.zCenter <= this.activeJunction.z + 4) continue;
      const diff = Math.abs(seg.zCenter - targetZ);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = seg;
      }
    }
    if (!best || bestDiff > GAME_CONFIG.segmentLength * 0.65) return null;
    this.setSegmentGap(best, true);
    return best.zCenter;
  }

  public applyBiomeVisuals(
    from: BiomeDefinition,
    to: BiomeDefinition,
    blend: number,
    dt: number,
    elapsed: number,
    particles: ParticlePool
  ): void {
    // Smoothly blend stone tint & canyon floor
    this.tmpColorA.setHex(from.stoneTint);
    this.tmpColorB.setHex(to.stoneTint);
    this.tmpColorA.lerp(this.tmpColorB, blend);
    this.floorMat.color.copy(this.tmpColorA);
    this.pillarMat.color.copy(this.tmpColorA);

    this.tmpColorA.setHex(from.fogColor);
    this.tmpColorB.setHex(to.fogColor);
    this.tmpColorA.lerp(this.tmpColorB, blend);
    this.canyonMat.color.copy(this.tmpColorA).multiplyScalar(0.45);
    this.distantRuinMat.color.setHex(0xb98a62).lerp(this.tmpColorA, 0.32);

    // Water plane (Aqueducts biome)
    const waterAlpha = THREE.MathUtils.lerp(from.waterOpacity, to.waterOpacity, blend);
    this.waterMesh.visible = waterAlpha > 0.02;
    this.waterMat.opacity = waterAlpha;
    if (this.waterMesh.visible) {
      this.waterBump.offset.y -= dt * 0.35;
      this.waterBump.offset.x = Math.sin(elapsed * 0.4) * 0.06;
    }

    // Wall braziers & rising embers (Torchlit Subterranean Vaults biome)
    const brazierLevel = THREE.MathUtils.lerp(from.brazierIntensity, to.brazierIntensity, blend);
    const showFlames = brazierLevel > 0.08;
    const flicker = 0.85 + Math.sin(elapsed * 19) * 0.12 + Math.cos(elapsed * 31) * 0.08;
    this.vaultPointLight.intensity = brazierLevel * 3.8 * flicker;

    // Tint ambient motes toward ember orange in Vaults, jade-aqua in Aqueducts, gold in Courtyard
    this.moteMat.color.setHex(
      brazierLevel > 0.5 ? 0xff914d : waterAlpha > 0.5 ? 0xa3f7e8 : PALETTE.brightGold
    );

    if (showFlames) {
      this.emberAccum += dt * brazierLevel;
    }
    const emitEmbers = this.emberAccum >= 0.09;
    if (emitEmbers) this.emberAccum = 0;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      for (let f = 0; f < seg.flames.length; f++) {
        const flame = seg.flames[f];
        flame.visible = showFlames && seg.group.visible;
        if (flame.visible) {
          const s = (0.75 + 0.35 * Math.sin(elapsed * 22 + i * 2 + f)) * brazierLevel;
          flame.scale.set(s * 0.9, s * 1.15, s * 0.9);
          if (emitEmbers && seg.zCenter > -55 && seg.zCenter < 6) {
            const bp = seg.brazierPositions[f];
            particles.spawnVaultEmber(bp.x, bp.y, seg.zCenter + bp.z);
          }
        }
      }
    }
  }

  public update(dt: number, speed: number, elapsed: number): void {
    const recycleZ = GAME_CONFIG.segmentLength * 1.5;

    if (this.activeJunction) {
      this.activeJunction.z += speed * dt;
      this.junctionGroup.position.z = this.activeJunction.z;
    }

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.zCenter += speed * dt;
      if (seg.zCenter > recycleZ) {
        seg.zCenter -= this.totalLength;
        this.setSegmentGap(seg, false);
      }

      // Hide straight segments that lie past an active approaching junction so they never poke through the back wall
      if (this.activeJunction && seg.zCenter < this.activeJunction.z - GAME_CONFIG.causewayWidth * 0.48) {
        seg.group.visible = false;
      } else {
        seg.group.visible = true;
      }

      seg.group.position.z = seg.zCenter;

      for (let v = 0; v < seg.vines.length; v++) {
        const vine = seg.vines[v];
        vine.rotation.z = Math.sin(elapsed * 1.7 + i * 0.9 + v) * 0.065;
        vine.rotation.x = Math.cos(elapsed * 1.3 + v * 1.4) * 0.04;
      }
    }

    // Drift sunlit dust / ember motes past camera
    for (let m = 0; m < this.moteCount; m++) {
      const idx = m * 3;
      this.motePositions[idx] += Math.sin(elapsed * 0.8 + m) * 0.25 * dt;
      this.motePositions[idx + 1] += Math.cos(elapsed * 1.1 + m * 0.5) * 0.18 * dt;
      this.motePositions[idx + 2] += speed * 0.65 * dt;
      if (this.motePositions[idx + 2] > 14) {
        this.motePositions[idx + 2] -= 105;
        this.motePositions[idx] = (Math.random() - 0.5) * 20;
        this.motePositions[idx + 1] = 0.6 + Math.random() * 8.5;
      }
    }
    this.ambientMotes.geometry.attributes.position.needsUpdate = true;
  }

  public reset(): void {
    this.clearJunctionAndRebaseSegments();
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
