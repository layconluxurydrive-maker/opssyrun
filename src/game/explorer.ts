import * as THREE from 'three';
import { OUTFITS, PALETTE, type CharacterId, type OutfitId } from './palette';

export interface ExplorerAnimState {
  dt: number;
  speed: number;
  speedRatio: number;
  y: number;
  vy: number;
  grounded: boolean;
  sliding: boolean;
  slideProgress: number;
  lateralVelocity: number;
  crashed: boolean;
  stumbling: boolean;
  previewMode: boolean;
  hasShield: boolean;
  magnetActive: boolean;
  dashActive: boolean;
  chaserProximity: number; // 0 = far away/hidden, 1 = right behind heels
}

interface HoundParts {
  group: THREE.Group;
  frontLegs: THREE.Group;
  backLegs: THREE.Group;
  head: THREE.Group;
}

export class ArticulatedExplorer {
  public readonly root = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();

  private readonly leftArmPivot = new THREE.Group();
  private readonly leftForearmPivot = new THREE.Group();
  private readonly rightArmPivot = new THREE.Group();
  private readonly rightForearmPivot = new THREE.Group();

  private readonly leftLegPivot = new THREE.Group();
  private readonly leftShinPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly rightShinPivot = new THREE.Group();

  private readonly scarfSegments: THREE.Group[] = [];
  private readonly contactShadow: THREE.Mesh;

  // Power-up visual auras around explorer
  private readonly shieldGroup = new THREE.Group();
  private readonly shieldShell: THREE.Mesh;
  private readonly shieldRing: THREE.Mesh;
  private readonly magnetRing = new THREE.Group();
  private readonly dashHalo = new THREE.Group();

  // Spectral Temple Hounds (chaser pack)
  private readonly chaserRoot = new THREE.Group();
  private readonly hounds: HoundParts[] = [];

  // Character visual groups attached to shared articulated joints
  private readonly characterGroups: Record<CharacterId, THREE.Object3D[]> = {
    explorer: [],
    panda: [],
    ronin: [],
  };
  private activeCharacter: CharacterId = 'explorer';

  // Swappable outfit materials
  private readonly tunicMat: THREE.MeshStandardMaterial;
  private readonly coatLowerMat: THREE.MeshStandardMaterial;
  private readonly hatMat: THREE.MeshStandardMaterial;
  private readonly scarfMat: THREE.MeshStandardMaterial;
  private readonly pantsMat: THREE.MeshStandardMaterial;
  private readonly accentMat: THREE.MeshStandardMaterial;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private runPhase = 0;
  private prevFootSign = 1;
  private squashY = 1;
  private squashXZ = 1;
  private bankAngle = 0;
  private crashSpin = 0;

  constructor(scene: THREE.Scene, contactShadowMap: THREE.Texture) {
    this.root.position.set(0, 0, 0);
    this.rig.position.set(0, 0, 0);
    this.root.add(this.rig);

    this.tunicMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.explorerTunic,
        roughness: 0.84,
        metalness: 0.02,
      })
    );
    this.coatLowerMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xcab08e,
        roughness: 0.88,
        metalness: 0.02,
      })
    );
    const leatherMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.explorerLeather,
        roughness: 0.56,
        metalness: 0.08,
      })
    );
    this.accentMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.brightGold,
        roughness: 0.24,
        metalness: 0.88,
      })
    );
    const skinMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd9a077,
        roughness: 0.68,
        metalness: 0.02,
      })
    );
    this.hatMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.explorerHat,
        roughness: 0.78,
        metalness: 0.04,
      })
    );
    this.scarfMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.terracottaScarf,
        roughness: 0.74,
        metalness: 0.02,
        side: THREE.DoubleSide,
      })
    );
    this.pantsMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.shadowSlate,
        roughness: 0.82,
        metalness: 0.04,
      })
    );

    // 1. Torso & tunic silhouette (Explorer)
    this.torsoGroup.position.set(0, 0.92, 0);
    this.rig.add(this.torsoGroup);

    const explorerTorso = this.regPart('explorer', new THREE.Group());
    this.torsoGroup.add(explorerTorso);

    const chestGeo = this.trackGeo(new THREE.CylinderGeometry(0.24, 0.2, 0.56, 12));
    const chestMesh = new THREE.Mesh(chestGeo, this.tunicMat);
    chestMesh.position.set(0, 0.24, 0);
    chestMesh.scale.set(1.12, 1, 0.82);
    chestMesh.castShadow = true;
    explorerTorso.add(chestMesh);

    const skirtGeo = this.trackGeo(new THREE.CylinderGeometry(0.21, 0.29, 0.28, 12, 1, false));
    const skirtMesh = new THREE.Mesh(skirtGeo, this.coatLowerMat);
    skirtMesh.position.set(0, -0.06, 0);
    skirtMesh.scale.set(1.1, 1, 0.84);
    skirtMesh.castShadow = true;
    explorerTorso.add(skirtMesh);

    const beltGeo = this.trackGeo(new THREE.CylinderGeometry(0.215, 0.215, 0.09, 12));
    const beltMesh = new THREE.Mesh(beltGeo, leatherMat);
    beltMesh.position.set(0, 0.04, 0);
    beltMesh.scale.set(1.12, 1, 0.85);
    beltMesh.castShadow = true;
    explorerTorso.add(beltMesh);

    const buckleGeo = this.trackGeo(new THREE.BoxGeometry(0.11, 0.095, 0.05));
    const buckleMesh = new THREE.Mesh(buckleGeo, this.accentMat);
    buckleMesh.position.set(0, 0.04, -0.185);
    explorerTorso.add(buckleMesh);

    const strapGeo = this.trackGeo(new THREE.TorusGeometry(0.26, 0.028, 8, 20));
    const strapMesh = new THREE.Mesh(strapGeo, leatherMat);
    strapMesh.position.set(0.02, 0.24, 0);
    strapMesh.rotation.set(0.25, 0.35, 0.68);
    strapMesh.scale.set(1.0, 1.28, 0.72);
    explorerTorso.add(strapMesh);

    const packGeo = this.trackGeo(new THREE.BoxGeometry(0.26, 0.28, 0.14));
    const packMesh = new THREE.Mesh(packGeo, leatherMat);
    packMesh.position.set(0, 0.25, 0.21);
    packMesh.castShadow = true;
    explorerTorso.add(packMesh);

    const packClaspGeo = this.trackGeo(new THREE.BoxGeometry(0.08, 0.06, 0.03));
    const packClasp = new THREE.Mesh(packClaspGeo, this.accentMat);
    packClasp.position.set(0, 0.27, 0.285);
    explorerTorso.add(packClasp);

    // 2. Head & Wide-Brim Explorer Hat
    this.headGroup.position.set(0, 0.56, 0);
    this.torsoGroup.add(this.headGroup);

    const explorerHead = this.regPart('explorer', new THREE.Group());
    this.headGroup.add(explorerHead);

    const headGeo = this.trackGeo(new THREE.SphereGeometry(0.18, 16, 14));
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.set(0, 0.16, 0);
    headMesh.castShadow = true;
    explorerHead.add(headMesh);

    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, 0.26, 0.01);
    hatGroup.rotation.x = -0.12;
    explorerHead.add(hatGroup);

    const brimGeo = this.trackGeo(new THREE.CylinderGeometry(0.42, 0.44, 0.035, 18));
    const brimMesh = new THREE.Mesh(brimGeo, this.hatMat);
    brimMesh.scale.set(1, 1, 1.08);
    brimMesh.castShadow = true;
    hatGroup.add(brimMesh);

    const crownGeo = this.trackGeo(new THREE.CylinderGeometry(0.165, 0.205, 0.21, 14));
    const crownMesh = new THREE.Mesh(crownGeo, this.hatMat);
    crownMesh.position.set(0, 0.1, 0);
    crownMesh.castShadow = true;
    hatGroup.add(crownMesh);

    const bandGeo = this.trackGeo(new THREE.CylinderGeometry(0.202, 0.208, 0.045, 14));
    const bandMesh = new THREE.Mesh(bandGeo, this.accentMat);
    bandMesh.position.set(0, 0.035, 0);
    hatGroup.add(bandMesh);

    // 3. Flowing Scarf (4 articulated ribbon segments for Explorer)
    const collarGeo = this.trackGeo(new THREE.TorusGeometry(0.175, 0.055, 8, 16));
    const collarMesh = new THREE.Mesh(collarGeo, this.scarfMat);
    collarMesh.position.set(0, 0.53, 0);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.castShadow = true;
    explorerTorso.add(collarMesh);

    let scarfParent: THREE.Group = explorerTorso;
    for (let i = 0; i < 4; i++) {
      const segPivot = new THREE.Group();
      if (i === 0) {
        segPivot.position.set(0.05, 0.52, 0.17);
      } else {
        segPivot.position.set(0, 0, 0.24);
      }
      const width = 0.14 - i * 0.018;
      const segGeo = this.trackGeo(new THREE.BoxGeometry(width, 0.032, 0.26));
      const segMesh = new THREE.Mesh(segGeo, this.scarfMat);
      segMesh.position.set(0, 0, 0.12);
      segMesh.castShadow = true;
      segPivot.add(segMesh);
      scarfParent.add(segPivot);
      this.scarfSegments.push(segPivot);
      scarfParent = segPivot;
    }

    // 4. Articulated Arms (shared pivots)
    const buildArm = (side: -1 | 1, shoulderPivot: THREE.Group, forearmPivot: THREE.Group) => {
      shoulderPivot.position.set(side * 0.3, 0.45, 0);
      this.torsoGroup.add(shoulderPivot);

      const expUpper = this.regPart('explorer', new THREE.Group());
      shoulderPivot.add(expUpper);
      const upperGeo = this.trackGeo(new THREE.CapsuleGeometry(0.068, 0.22, 6, 10));
      const upperMesh = new THREE.Mesh(upperGeo, this.tunicMat);
      upperMesh.position.set(0, -0.14, 0);
      upperMesh.castShadow = true;
      expUpper.add(upperMesh);

      forearmPivot.position.set(0, -0.28, 0);
      shoulderPivot.add(forearmPivot);

      const expFore = this.regPart('explorer', new THREE.Group());
      forearmPivot.add(expFore);
      const foreGeo = this.trackGeo(new THREE.CapsuleGeometry(0.056, 0.2, 6, 10));
      const foreMesh = new THREE.Mesh(foreGeo, skinMat);
      foreMesh.position.set(0, -0.12, 0);
      foreMesh.castShadow = true;
      expFore.add(foreMesh);

      const cuffGeo = this.trackGeo(new THREE.CylinderGeometry(0.064, 0.064, 0.07, 10));
      const cuffMesh = new THREE.Mesh(cuffGeo, leatherMat);
      cuffMesh.position.set(0, -0.04, 0);
      expFore.add(cuffMesh);
    };

    buildArm(-1, this.leftArmPivot, this.leftForearmPivot);
    buildArm(1, this.rightArmPivot, this.rightForearmPivot);

    // 5. Articulated Legs (shared pivots)
    const buildLeg = (side: -1 | 1, hipPivot: THREE.Group, shinPivot: THREE.Group) => {
      hipPivot.position.set(side * 0.14, 0.88, 0);
      this.rig.add(hipPivot);

      const expThigh = this.regPart('explorer', new THREE.Group());
      hipPivot.add(expThigh);
      const thighGeo = this.trackGeo(new THREE.CapsuleGeometry(0.088, 0.26, 6, 10));
      const thighMesh = new THREE.Mesh(thighGeo, this.pantsMat);
      thighMesh.position.set(0, -0.19, 0);
      thighMesh.castShadow = true;
      expThigh.add(thighMesh);

      shinPivot.position.set(0, -0.4, 0);
      hipPivot.add(shinPivot);

      const expShin = this.regPart('explorer', new THREE.Group());
      shinPivot.add(expShin);
      const shinGeo = this.trackGeo(new THREE.CapsuleGeometry(0.072, 0.24, 6, 10));
      const shinMesh = new THREE.Mesh(shinGeo, this.pantsMat);
      shinMesh.position.set(0, -0.17, 0);
      shinMesh.castShadow = true;
      expShin.add(shinMesh);

      const bootShaftGeo = this.trackGeo(new THREE.CylinderGeometry(0.082, 0.078, 0.16, 10));
      const bootShaft = new THREE.Mesh(bootShaftGeo, leatherMat);
      bootShaft.position.set(0, -0.34, 0);
      bootShaft.castShadow = true;
      expShin.add(bootShaft);

      const bootSoleGeo = this.trackGeo(new THREE.BoxGeometry(0.15, 0.09, 0.24));
      const bootSole = new THREE.Mesh(bootSoleGeo, leatherMat);
      bootSole.position.set(0, -0.435, -0.04);
      bootSole.castShadow = true;
      expShin.add(bootSole);
    };

    buildLeg(-1, this.leftLegPivot, this.leftShinPivot);
    buildLeg(1, this.rightLegPivot, this.rightShinPivot);

    // Build Master Panda & Shadow Ronin 3D character rigs onto the shared pivots
    this.buildMasterPandaMeshes();
    this.buildShadowRoninMeshes();
    this.applyCharacter('explorer');

    // 6. Amber Aegis Shield Aura (translucent faceted sphere + gold orbital ring)
    this.shieldGroup.position.set(0, 1.02, 0);
    const shellGeo = this.trackGeo(new THREE.IcosahedronGeometry(0.95, 1));
    const shellMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.amberRelic,
        emissive: 0xc96b1f,
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0.15,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      })
    );
    this.shieldShell = new THREE.Mesh(shellGeo, shellMat);
    this.shieldGroup.add(this.shieldShell);

    const shieldRingGeo = this.trackGeo(new THREE.TorusGeometry(0.98, 0.025, 8, 28));
    const shieldRingMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.brightGold,
        emissive: PALETTE.hammeredGold,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.85,
      })
    );
    this.shieldRing = new THREE.Mesh(shieldRingGeo, shieldRingMat);
    this.shieldRing.rotation.x = Math.PI / 2.6;
    this.shieldGroup.add(this.shieldRing);
    this.shieldGroup.visible = false;
    this.root.add(this.shieldGroup);

    // 7. Jade Magnet Orbit Ring
    this.magnetRing.position.set(0, 1.12, 0);
    const magTorusGeo = this.trackGeo(new THREE.TorusGeometry(0.76, 0.03, 8, 28));
    const magTorusMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.jadeRelic,
        emissive: 0x268c69,
        emissiveIntensity: 0.65,
        roughness: 0.25,
        metalness: 0.7,
      })
    );
    const magTorus = new THREE.Mesh(magTorusGeo, magTorusMat);
    magTorus.rotation.x = Math.PI / 2;
    this.magnetRing.add(magTorus);
    this.magnetRing.visible = false;
    this.root.add(this.magnetRing);

    // 8. Sunburst Dash Aura Cone
    this.dashHalo.position.set(0, 1.0, -0.35);
    const dashConeGeo = this.trackGeo(new THREE.ConeGeometry(0.95, 2.2, 16, 1, true));
    const dashConeMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.brightGold,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const dashCone = new THREE.Mesh(dashConeGeo, dashConeMat);
    dashCone.rotation.x = -Math.PI / 2;
    this.dashHalo.add(dashCone);
    this.dashHalo.visible = false;
    this.root.add(this.dashHalo);

    // 9. Spectral Temple Hounds / Stone Guardians (2 articulated flanking chasers)
    this.buildChaserHounds();
    this.chaserRoot.visible = false;
    scene.add(this.chaserRoot);

    // 10. Soft grounded contact shadow
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(1.5, 1.5));
    const shadowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: contactShadowMap,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
      })
    );
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.set(0, 0.025, 0);
    scene.add(this.contactShadow);

    scene.add(this.root);
  }

  private buildChaserHounds(): void {
    const bodyMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.slateDark,
        roughness: 0.65,
        metalness: 0.28,
      })
    );
    const eyeMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.brightGold,
      })
    );
    const crestMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.hammeredGold,
        emissive: 0xd96b27,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.75,
      })
    );

    const torsoGeo = this.trackGeo(new THREE.BoxGeometry(0.46, 0.44, 0.96));
    const headGeo = this.trackGeo(new THREE.BoxGeometry(0.38, 0.32, 0.46));
    const snoutGeo = this.trackGeo(new THREE.BoxGeometry(0.24, 0.18, 0.28));
    const earGeo = this.trackGeo(new THREE.ConeGeometry(0.08, 0.26, 4));
    const eyeGeo = this.trackGeo(new THREE.BoxGeometry(0.07, 0.055, 0.04));
    const legGeo = this.trackGeo(new THREE.BoxGeometry(0.13, 0.46, 0.16));
    const crestGeo = this.trackGeo(new THREE.BoxGeometry(0.1, 0.14, 0.58));

    for (const side of [-1, 1]) {
      const hGroup = new THREE.Group();
      hGroup.position.set(side * 1.15, 0.55, 0);

      const body = new THREE.Mesh(torsoGeo, bodyMat);
      body.castShadow = true;
      hGroup.add(body);

      const spine = new THREE.Mesh(crestGeo, crestMat);
      spine.position.set(0, 0.25, 0.05);
      hGroup.add(spine);

      const headPivot = new THREE.Group();
      headPivot.position.set(0, 0.2, -0.52);
      hGroup.add(headPivot);

      const skull = new THREE.Mesh(headGeo, bodyMat);
      skull.castShadow = true;
      headPivot.add(skull);

      const snout = new THREE.Mesh(snoutGeo, bodyMat);
      snout.position.set(0, -0.05, -0.28);
      headPivot.add(snout);

      for (const es of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.position.set(es * 0.13, 0.24, 0.08);
        headPivot.add(ear);

        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(es * 0.11, 0.05, -0.24);
        headPivot.add(eye);
      }

      const frontLegs = new THREE.Group();
      frontLegs.position.set(0, -0.18, -0.34);
      hGroup.add(frontLegs);
      for (const ls of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(ls * 0.16, -0.18, 0);
        frontLegs.add(leg);
      }

      const backLegs = new THREE.Group();
      backLegs.position.set(0, -0.18, 0.34);
      hGroup.add(backLegs);
      for (const ls of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(ls * 0.16, -0.18, 0);
        backLegs.add(leg);
      }

      this.chaserRoot.add(hGroup);
      this.hounds.push({ group: hGroup, frontLegs, backLegs, head: headPivot });
    }
  }

  private regPart<T extends THREE.Object3D>(charId: CharacterId, obj: T): T {
    this.characterGroups[charId].push(obj);
    return obj;
  }

  private buildMasterPandaMeshes(): void {
    const hoodieMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x4b4f56, roughness: 0.94, metalness: 0.02 })
    );
    const hoodieTrimMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x32363c, roughness: 0.88, metalness: 0.05 })
    );
    const teeMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xc29e74, roughness: 0.85, metalness: 0.02 })
    );
    const goldChainMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.18, metalness: 0.94 })
    );
    const whiteFurMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf1eee7, roughness: 0.9, metalness: 0.01 })
    );
    const blackFurMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.86, metalness: 0.03 })
    );
    const eyeGlowMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: 0x4ecdc4 })
    );
    const pantsMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.82, metalness: 0.04 })
    );
    const soleMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.65, metalness: 0.04 })
    );

    // Panda Torso (chunky fleece hoodie + tan tee + chunky Cuban gold chain)
    const pTorso = this.regPart('panda', new THREE.Group());
    this.torsoGroup.add(pTorso);

    const jacketGeo = this.trackGeo(new THREE.CylinderGeometry(0.31, 0.33, 0.62, 14));
    const jacket = new THREE.Mesh(jacketGeo, hoodieMat);
    jacket.position.set(0, 0.22, 0);
    jacket.scale.set(1.14, 1, 0.92);
    jacket.castShadow = true;
    pTorso.add(jacket);

    const teeGeo = this.trackGeo(new THREE.BoxGeometry(0.2, 0.48, 0.1));
    const tee = new THREE.Mesh(teeGeo, teeMat);
    tee.position.set(0, 0.22, -0.26);
    pTorso.add(tee);

    const hemGeo = this.trackGeo(new THREE.CylinderGeometry(0.335, 0.32, 0.1, 14));
    const hem = new THREE.Mesh(hemGeo, hoodieTrimMat);
    hem.position.set(0, -0.06, 0);
    hem.scale.set(1.14, 1, 0.92);
    pTorso.add(hem);

    const hoodCollarGeo = this.trackGeo(new THREE.TorusGeometry(0.24, 0.085, 8, 16));
    const hoodCollar = new THREE.Mesh(hoodCollarGeo, hoodieMat);
    hoodCollar.position.set(0, 0.51, 0.04);
    hoodCollar.rotation.set(Math.PI / 2.2, 0, 0);
    hoodCollar.castShadow = true;
    pTorso.add(hoodCollar);

    // Chunky Gold Cuban Link Chain
    const chainGeo = this.trackGeo(new THREE.TorusGeometry(0.23, 0.036, 10, 22));
    const chain = new THREE.Mesh(chainGeo, goldChainMat);
    chain.position.set(0, 0.41, -0.1);
    chain.rotation.set(Math.PI / 2.6, 0, 0);
    chain.castShadow = true;
    pTorso.add(chain);

    // Panda Head (white skull, round ears, eye patches, snout)
    const pHead = this.regPart('panda', new THREE.Group());
    this.headGroup.add(pHead);

    const skullGeo = this.trackGeo(new THREE.SphereGeometry(0.24, 18, 16));
    const skull = new THREE.Mesh(skullGeo, whiteFurMat);
    skull.position.set(0, 0.2, 0);
    skull.scale.set(1.06, 0.98, 1.0);
    skull.castShadow = true;
    pHead.add(skull);

    const earGeo = this.trackGeo(new THREE.SphereGeometry(0.082, 12, 10));
    const patchGeo = this.trackGeo(new THREE.SphereGeometry(0.068, 10, 10));
    const irisGeo = this.trackGeo(new THREE.SphereGeometry(0.025, 8, 8));
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, blackFurMat);
      ear.position.set(sx * 0.2, 0.42, 0.02);
      ear.castShadow = true;
      pHead.add(ear);

      const patch = new THREE.Mesh(patchGeo, blackFurMat);
      patch.position.set(sx * 0.095, 0.23, -0.2);
      patch.scale.set(1.0, 1.25, 0.55);
      patch.rotation.z = sx * 0.22;
      pHead.add(patch);

      const iris = new THREE.Mesh(irisGeo, eyeGlowMat);
      iris.position.set(sx * 0.09, 0.235, -0.235);
      pHead.add(iris);
    }

    const snoutGeo = this.trackGeo(new THREE.SphereGeometry(0.095, 12, 10));
    const snout = new THREE.Mesh(snoutGeo, whiteFurMat);
    snout.position.set(0, 0.145, -0.21);
    snout.scale.set(1.15, 0.82, 0.95);
    pHead.add(snout);

    const noseGeo = this.trackGeo(new THREE.SphereGeometry(0.038, 10, 8));
    const nose = new THREE.Mesh(noseGeo, blackFurMat);
    nose.position.set(0, 0.175, -0.295);
    nose.scale.set(1.3, 0.85, 0.8);
    pHead.add(nose);

    // Panda Arms & Fur Forearms
    const sleeveGeo = this.trackGeo(new THREE.CapsuleGeometry(0.095, 0.22, 6, 10));
    const pawForeGeo = this.trackGeo(new THREE.CapsuleGeometry(0.075, 0.18, 6, 10));
    const pawFistGeo = this.trackGeo(new THREE.SphereGeometry(0.082, 10, 10));
    for (const [shoulder, fore] of [
      [this.leftArmPivot, this.leftForearmPivot],
      [this.rightArmPivot, this.rightForearmPivot],
    ] as const) {
      const uGroup = this.regPart('panda', new THREE.Group());
      const sleeve = new THREE.Mesh(sleeveGeo, hoodieMat);
      sleeve.position.set(0, -0.14, 0);
      sleeve.castShadow = true;
      uGroup.add(sleeve);
      shoulder.add(uGroup);

      const fGroup = this.regPart('panda', new THREE.Group());
      const fArm = new THREE.Mesh(pawForeGeo, blackFurMat);
      fArm.position.set(0, -0.11, 0);
      fArm.castShadow = true;
      fGroup.add(fArm);
      const fist = new THREE.Mesh(pawFistGeo, blackFurMat);
      fist.position.set(0, -0.23, 0);
      fGroup.add(fist);
      fore.add(fGroup);
    }

    // Panda Street Trousers & Sneakers
    const pThighGeo = this.trackGeo(new THREE.CapsuleGeometry(0.105, 0.25, 6, 10));
    const pShinGeo = this.trackGeo(new THREE.CapsuleGeometry(0.09, 0.23, 6, 10));
    const sneakerGeo = this.trackGeo(new THREE.BoxGeometry(0.17, 0.1, 0.26));
    const soleGeo = this.trackGeo(new THREE.BoxGeometry(0.175, 0.04, 0.27));
    for (const [hip, shin] of [
      [this.leftLegPivot, this.leftShinPivot],
      [this.rightLegPivot, this.rightShinPivot],
    ] as const) {
      const tGroup = this.regPart('panda', new THREE.Group());
      const thigh = new THREE.Mesh(pThighGeo, pantsMat);
      thigh.position.set(0, -0.19, 0);
      thigh.castShadow = true;
      tGroup.add(thigh);
      hip.add(tGroup);

      const sGroup = this.regPart('panda', new THREE.Group());
      const legLower = new THREE.Mesh(pShinGeo, pantsMat);
      legLower.position.set(0, -0.16, 0);
      legLower.castShadow = true;
      sGroup.add(legLower);
      const sneaker = new THREE.Mesh(sneakerGeo, blackFurMat);
      sneaker.position.set(0, -0.39, -0.04);
      sneaker.castShadow = true;
      sGroup.add(sneaker);
      const sole = new THREE.Mesh(soleGeo, soleMat);
      sole.position.set(0, -0.45, -0.04);
      sGroup.add(sole);
      shin.add(sGroup);
    }
  }

  private buildShadowRoninMeshes(): void {
    const obsidianMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1a1d23, roughness: 0.34, metalness: 0.78 })
    );
    const chromeMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xb6c0ce, roughness: 0.16, metalness: 0.95 })
    );
    const weaveHatMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.78, metalness: 0.24 })
    );
    const hiltMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xdedfe3, roughness: 0.55, metalness: 0.35 })
    );
    const visorMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: 0x7be0ff })
    );

    // Cyber Ronin Torso (armored chest, chrome ribs, pauldrons, waist tassets, twin back katanas)
    const rTorso = this.regPart('ronin', new THREE.Group());
    this.torsoGroup.add(rTorso);

    const chestPlateGeo = this.trackGeo(new THREE.BoxGeometry(0.48, 0.34, 0.3));
    const chestPlate = new THREE.Mesh(chestPlateGeo, obsidianMat);
    chestPlate.position.set(0, 0.35, 0);
    chestPlate.castShadow = true;
    rTorso.add(chestPlate);

    const absGeo = this.trackGeo(new THREE.CylinderGeometry(0.17, 0.19, 0.3, 10));
    const abs = new THREE.Mesh(absGeo, chromeMat);
    abs.position.set(0, 0.1, 0);
    abs.scale.set(1.15, 1, 0.85);
    rTorso.add(abs);

    // Shoulder Pauldrons
    const pauldronGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 0.14, 0.24));
    for (const sx of [-1, 1]) {
      const pld = new THREE.Mesh(pauldronGeo, obsidianMat);
      pld.position.set(sx * 0.31, 0.46, 0);
      pld.rotation.z = sx * -0.25;
      pld.castShadow = true;
      rTorso.add(pld);
    }

    // Waist Armored Tassets
    const tassetGeo = this.trackGeo(new THREE.BoxGeometry(0.08, 0.36, 0.28));
    for (const sx of [-1, 1]) {
      const tasset = new THREE.Mesh(tassetGeo, obsidianMat);
      tasset.position.set(sx * 0.24, -0.1, 0);
      tasset.rotation.z = sx * 0.18;
      tasset.castShadow = true;
      rTorso.add(tasset);
    }

    // Twin Crossed Back Katanas
    const scabbardGeo = this.trackGeo(new THREE.CylinderGeometry(0.022, 0.018, 1.05, 8));
    const gripGeo = this.trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 8));
    const guardGeo = this.trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10));
    for (const [idx, rotZ] of [
      [-1, 0.48],
      [1, 0.62],
    ] as const) {
      const katana = new THREE.Group();
      katana.position.set(0.08 + idx * 0.06, 0.35, 0.2);
      katana.rotation.set(0.18, 0, rotZ);

      const scabbard = new THREE.Mesh(scabbardGeo, obsidianMat);
      scabbard.position.set(0, -0.05, 0);
      scabbard.castShadow = true;
      katana.add(scabbard);

      const guard = new THREE.Mesh(guardGeo, chromeMat);
      guard.position.set(0, 0.46, 0);
      katana.add(guard);

      const grip = new THREE.Mesh(gripGeo, hiltMat);
      grip.position.set(0, 0.61, 0);
      katana.add(grip);

      rTorso.add(katana);
    }

    // Cyber Ronin Head + Conical Lattice Kasa Hat
    const rHead = this.regPart('ronin', new THREE.Group());
    this.headGroup.add(rHead);

    const helmGeo = this.trackGeo(new THREE.SphereGeometry(0.175, 14, 12));
    const helm = new THREE.Mesh(helmGeo, obsidianMat);
    helm.position.set(0, 0.17, 0);
    helm.scale.set(0.95, 1.08, 1.05);
    helm.castShadow = true;
    rHead.add(helm);

    const visorGeo = this.trackGeo(new THREE.BoxGeometry(0.21, 0.036, 0.06));
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.18, -0.155);
    rHead.add(visor);

    const kasaGroup = new THREE.Group();
    kasaGroup.position.set(0, 0.34, 0.01);
    kasaGroup.rotation.x = -0.1;
    rHead.add(kasaGroup);

    const kasaConeGeo = this.trackGeo(new THREE.ConeGeometry(0.54, 0.22, 24));
    const kasaCone = new THREE.Mesh(kasaConeGeo, weaveHatMat);
    kasaCone.castShadow = true;
    kasaGroup.add(kasaCone);

    const kasaRimGeo = this.trackGeo(new THREE.TorusGeometry(0.54, 0.022, 8, 28));
    const kasaRim = new THREE.Mesh(kasaRimGeo, chromeMat);
    kasaRim.position.set(0, -0.105, 0);
    kasaRim.rotation.x = Math.PI / 2;
    kasaGroup.add(kasaRim);

    const kasaCapGeo = this.trackGeo(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 16));
    const kasaCap = new THREE.Mesh(kasaCapGeo, chromeMat);
    kasaCap.position.set(0, 0.09, 0);
    kasaGroup.add(kasaCap);

    // Cybernetic Arms + Drawn Katana in Right Hand
    const rUpperGeo = this.trackGeo(new THREE.CapsuleGeometry(0.064, 0.22, 6, 10));
    const rForeGeo = this.trackGeo(new THREE.CapsuleGeometry(0.056, 0.2, 6, 10));
    const jointGeo = this.trackGeo(new THREE.TorusGeometry(0.064, 0.016, 6, 12));
    for (const [side, shoulder, fore] of [
      [-1, this.leftArmPivot, this.leftForearmPivot],
      [1, this.rightArmPivot, this.rightForearmPivot],
    ] as const) {
      const uGroup = this.regPart('ronin', new THREE.Group());
      const upper = new THREE.Mesh(rUpperGeo, obsidianMat);
      upper.position.set(0, -0.14, 0);
      upper.castShadow = true;
      uGroup.add(upper);
      shoulder.add(uGroup);

      const fGroup = this.regPart('ronin', new THREE.Group());
      const elbow = new THREE.Mesh(jointGeo, chromeMat);
      elbow.rotation.x = Math.PI / 2;
      fGroup.add(elbow);
      const forearm = new THREE.Mesh(rForeGeo, obsidianMat);
      forearm.position.set(0, -0.12, 0);
      forearm.castShadow = true;
      fGroup.add(forearm);

      if (side === 1) {
        // Drawn silver katana blade in right hand
        const bladeGeo = this.trackGeo(new THREE.BoxGeometry(0.018, 0.036, 0.96));
        const blade = new THREE.Mesh(bladeGeo, chromeMat);
        blade.position.set(0, -0.24, -0.44);
        blade.castShadow = true;
        fGroup.add(blade);
      }
      fore.add(fGroup);
    }

    // Cybernetic Legs & Greaves
    const rThighGeo = this.trackGeo(new THREE.CapsuleGeometry(0.086, 0.26, 6, 10));
    const rShinGeo = this.trackGeo(new THREE.CapsuleGeometry(0.072, 0.24, 6, 10));
    const kneeGeo = this.trackGeo(new THREE.BoxGeometry(0.11, 0.1, 0.12));
    const greaveGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.1, 0.25));
    for (const [hip, shin] of [
      [this.leftLegPivot, this.leftShinPivot],
      [this.rightLegPivot, this.rightShinPivot],
    ] as const) {
      const tGroup = this.regPart('ronin', new THREE.Group());
      const thigh = new THREE.Mesh(rThighGeo, obsidianMat);
      thigh.position.set(0, -0.19, 0);
      thigh.castShadow = true;
      tGroup.add(thigh);
      hip.add(tGroup);

      const sGroup = this.regPart('ronin', new THREE.Group());
      const knee = new THREE.Mesh(kneeGeo, chromeMat);
      knee.position.set(0, -0.02, -0.05);
      sGroup.add(knee);
      const lower = new THREE.Mesh(rShinGeo, obsidianMat);
      lower.position.set(0, -0.17, 0);
      lower.castShadow = true;
      sGroup.add(lower);
      const boot = new THREE.Mesh(greaveGeo, obsidianMat);
      boot.position.set(0, -0.42, -0.04);
      boot.castShadow = true;
      sGroup.add(boot);
      shin.add(sGroup);
    }
  }

  public applyCharacter(charId: CharacterId): void {
    this.activeCharacter = charId;
    (['explorer', 'panda', 'ronin'] as CharacterId[]).forEach((id) => {
      const visible = id === charId;
      for (const obj of this.characterGroups[id]) {
        obj.visible = visible;
      }
    });
  }

  public applyOutfit(outfitId: OutfitId): void {
    const outfit = OUTFITS.find((o) => o.id === outfitId) ?? OUTFITS[0];
    this.tunicMat.color.setHex(outfit.tunic);
    this.coatLowerMat.color.setHex(outfit.coatLower);
    this.hatMat.color.setHex(outfit.hat);
    this.scarfMat.color.setHex(outfit.scarf);
    this.pantsMat.color.setHex(outfit.pants);
    this.accentMat.color.setHex(outfit.accent);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  public triggerJumpSquash(): void {
    this.squashY = 1.24;
    this.squashXZ = 0.84;
  }

  public triggerLandSquash(hardImpact = false): void {
    this.squashY = hardImpact ? 0.68 : 0.78;
    this.squashXZ = hardImpact ? 1.24 : 1.16;
  }

  public reset(): void {
    this.runPhase = 0;
    this.prevFootSign = 1;
    this.squashY = 1;
    this.squashXZ = 1;
    this.bankAngle = 0;
    this.crashSpin = 0;
    this.root.position.set(0, 0, 0);
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.shieldGroup.visible = false;
    this.magnetRing.visible = false;
    this.dashHalo.visible = false;
    this.chaserRoot.visible = false;
  }

  public update(state: ExplorerAnimState): boolean {
    const {
      dt,
      speed,
      speedRatio,
      y,
      vy,
      grounded,
      sliding,
      lateralVelocity,
      crashed,
      stumbling,
      previewMode,
      hasShield,
      magnetActive,
      dashActive,
      chaserProximity,
    } = state;
    let footstepFired = false;
    const nowSec = performance.now() * 0.001;

    this.root.position.y = y;

    // Update Power-Up Auras
    this.shieldGroup.visible = hasShield && !crashed;
    if (this.shieldGroup.visible) {
      this.shieldShell.rotation.y += dt * 1.1;
      this.shieldRing.rotation.z += dt * 2.4;
      const pulse = 1 + Math.sin(nowSec * 5.2) * 0.035;
      this.shieldGroup.scale.setScalar(pulse);
    }

    this.magnetRing.visible = magnetActive && !crashed;
    if (this.magnetRing.visible) {
      this.magnetRing.rotation.y += dt * 4.5;
      this.magnetRing.rotation.z = Math.sin(nowSec * 4.0) * 0.22;
    }

    this.dashHalo.visible = dashActive && !crashed;
    if (this.dashHalo.visible) {
      this.dashHalo.rotation.z += dt * 11.0;
      const s = 0.95 + Math.sin(nowSec * 18) * 0.08;
      this.dashHalo.scale.set(s, s, 1);
    }

    // Update Spectral Temple Hounds behind the explorer
    if (chaserProximity > 0.02 && !previewMode) {
      this.chaserRoot.visible = true;
      this.chaserRoot.position.x = THREE.MathUtils.damp(
        this.chaserRoot.position.x,
        this.root.position.x,
        7.5,
        dt
      );
      // Proximity 1.0 -> z = 2.45 (snapping right behind explorer), 0 -> z = 8.5 (fading behind camera)
      this.chaserRoot.position.z = THREE.MathUtils.lerp(8.5, 2.35, chaserProximity);
      for (let i = 0; i < this.hounds.length; i++) {
        const hound = this.hounds[i];
        const phase = nowSec * 15 + i * 1.8;
        hound.group.position.y = 0.52 + Math.abs(Math.sin(phase)) * 0.22;
        hound.frontLegs.rotation.x = Math.sin(phase) * 0.72;
        hound.backLegs.rotation.x = -Math.sin(phase) * 0.72;
        hound.head.rotation.x = Math.sin(phase * 0.5) * 0.18;
      }
    } else {
      this.chaserRoot.visible = false;
    }

    // Contact shadow grounding
    this.contactShadow.position.x = this.root.position.x;
    this.contactShadow.position.z = this.root.position.z;
    const heightScale = THREE.MathUtils.clamp(1 - y * 0.14, 0.45, 1.0);
    const shadowScale = sliding ? 1.18 : heightScale;
    this.contactShadow.scale.set(shadowScale, shadowScale * 1.15, 1);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(
      0.58 - y * 0.12,
      0.16,
      0.58
    );

    // Smooth squash & stretch recovery
    this.squashY = THREE.MathUtils.damp(this.squashY, sliding ? 0.86 : 1.0, 14, dt);
    this.squashXZ = THREE.MathUtils.damp(this.squashXZ, sliding ? 1.12 : 1.0, 14, dt);
    this.rig.scale.set(this.squashXZ, this.squashY, this.squashXZ);

    // Banking tilt during lane switch
    const targetBank = THREE.MathUtils.clamp(-lateralVelocity * 0.036, -0.34, 0.34);
    this.bankAngle = THREE.MathUtils.damp(this.bankAngle, targetBank, 14, dt);

    if (crashed) {
      this.crashSpin = THREE.MathUtils.damp(this.crashSpin, 0.68, 8, dt);
      this.rig.rotation.set(-0.42, this.crashSpin, this.bankAngle * 0.5);
      this.rig.position.y = THREE.MathUtils.damp(this.rig.position.y, 0.08, 8, dt);
      this.leftArmPivot.rotation.set(-0.9, 0, -0.5);
      this.rightArmPivot.rotation.set(-0.7, 0, 0.5);
      this.leftLegPivot.rotation.set(0.4, 0, 0);
      this.rightLegPivot.rotation.set(-0.35, 0, 0);
      this.animateScarf(dt, 4, 0, 0, true);
      return false;
    }

    if (sliding) {
      this.rig.position.y = THREE.MathUtils.damp(this.rig.position.y, -0.44, 18, dt);
      this.rig.rotation.set(0.72, 0, this.bankAngle * 0.65);

      this.torsoGroup.rotation.set(0.24, 0, 0);
      this.headGroup.rotation.set(-0.62, 0, 0);

      this.leftLegPivot.rotation.set(1.25, 0, -0.06);
      this.leftShinPivot.rotation.set(-0.18, 0, 0);
      this.rightLegPivot.rotation.set(-0.35, 0, 0.08);
      this.rightShinPivot.rotation.set(-1.35, 0, 0);

      this.leftArmPivot.rotation.set(-0.85, 0, -0.32);
      this.leftForearmPivot.rotation.set(0.45, 0, 0);
      this.rightArmPivot.rotation.set(-0.65, 0, 0.32);
      this.rightForearmPivot.rotation.set(0.45, 0, 0);

      this.animateScarf(dt, speed, vy, lateralVelocity, false);
      return false;
    }

    this.rig.position.y = THREE.MathUtils.damp(this.rig.position.y, 0, 16, dt);

    if (!grounded) {
      const airPitch = THREE.MathUtils.clamp(vy * 0.025, -0.25, 0.22);
      this.rig.rotation.set(-0.16 + airPitch, -this.bankAngle * 0.35, this.bankAngle);
      this.torsoGroup.rotation.set(-0.12, 0, 0);
      this.headGroup.rotation.set(0.08, 0, 0);

      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, 0.72, 12, dt);
      this.leftShinPivot.rotation.x = THREE.MathUtils.damp(this.leftShinPivot.rotation.x, -1.05, 12, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, -0.45, 12, dt);
      this.rightShinPivot.rotation.x = THREE.MathUtils.damp(this.rightShinPivot.rotation.x, -0.75, 12, dt);

      this.leftArmPivot.rotation.set(0.95, 0, -0.28);
      this.leftForearmPivot.rotation.set(0.55, 0, 0);
      this.rightArmPivot.rotation.set(-0.55, 0, 0.28);
      this.rightForearmPivot.rotation.set(0.75, 0, 0);

      this.animateScarf(dt, speed, vy, lateralVelocity, false);
      return false;
    }

    const strideRate = previewMode ? 8.2 : 10.2 + speedRatio * 5.2 + (dashActive ? 3.5 : 0);
    this.runPhase += dt * strideRate;
    const sinP = Math.sin(this.runPhase);
    const cosP = Math.cos(this.runPhase);

    const sign = sinP >= 0 ? 1 : -1;
    if (sign !== this.prevFootSign) {
      this.prevFootSign = sign;
      footstepFired = true;
    }

    const bounce = Math.abs(cosP) * 0.075;
    this.rig.position.y = bounce;

    const stumblePitch = stumbling ? Math.sin(nowSec * 28) * 0.25 - 0.18 : 0;
    const stumbleRoll = stumbling ? Math.cos(nowSec * 22) * 0.22 : 0;
    const forwardLean = -(0.16 + speedRatio * 0.14 + (dashActive ? 0.14 : 0)) + stumblePitch;
    this.rig.rotation.set(forwardLean, -this.bankAngle * 0.42, this.bankAngle + stumbleRoll);

    this.torsoGroup.rotation.set(-0.04, -sinP * 0.14, 0);
    this.headGroup.rotation.set(0.12 + Math.abs(cosP) * 0.04, sinP * 0.08, -this.bankAngle * 0.35);

    const legAmp = 0.88 + speedRatio * 0.18;
    this.leftLegPivot.rotation.set(sinP * legAmp, 0, 0);
    this.rightLegPivot.rotation.set(-sinP * legAmp, 0, 0);

    this.leftShinPivot.rotation.set(-Math.max(0, -cosP) * 1.15 - 0.12, 0, 0);
    this.rightShinPivot.rotation.set(-Math.max(0, cosP) * 1.15 - 0.12, 0, 0);

    const armAmp = 0.78 + speedRatio * 0.16;
    this.leftArmPivot.rotation.set(-sinP * armAmp, 0, stumbling ? -0.45 : -0.14);
    this.rightArmPivot.rotation.set(sinP * armAmp, 0, stumbling ? 0.45 : 0.14);
    this.leftForearmPivot.rotation.set(0.82 + Math.max(0, sinP) * 0.45, 0, 0);
    this.rightForearmPivot.rotation.set(0.82 + Math.max(0, -sinP) * 0.45, 0, 0);

    this.animateScarf(dt, speed, vy, lateralVelocity, false);
    return footstepFired;
  }

  private animateScarf(
    dt: number,
    speed: number,
    vy: number,
    lateralVelocity: number,
    settled: boolean
  ): void {
    if (this.activeCharacter !== 'explorer') return;
    const t = performance.now() * 0.001;
    const flutterSpeed = settled ? 2.5 : 10 + speed * 0.45;
    const flutterAmp = settled ? 0.04 : 0.16 + Math.min(0.14, speed * 0.004);
    const liftFromFall = THREE.MathUtils.clamp(-vy * 0.045, -0.45, 0.65);
    const lateralTrail = THREE.MathUtils.clamp(-lateralVelocity * 0.032, -0.35, 0.35);

    for (let i = 0; i < this.scarfSegments.length; i++) {
      const seg = this.scarfSegments[i];
      const wave = Math.sin(t * flutterSpeed - i * 1.15) * flutterAmp * (0.6 + i * 0.3);
      const sway = Math.cos(t * flutterSpeed * 0.75 - i * 0.9) * flutterAmp * 0.65;
      const targetX = (i === 0 ? -0.12 + liftFromFall : liftFromFall * 0.3) + wave;
      const targetY = sway + (i === 0 ? lateralTrail : lateralTrail * 0.4);
      seg.rotation.x = THREE.MathUtils.damp(seg.rotation.x, targetX, 16, dt);
      seg.rotation.y = THREE.MathUtils.damp(seg.rotation.y, targetY, 16, dt);
    }
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
