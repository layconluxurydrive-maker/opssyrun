import * as THREE from 'three';
import { PALETTE } from './palette';

type ParticleKind = 'dust' | 'gold' | 'jade' | 'amber' | 'ember';

interface ParticleSlot {
  active: boolean;
  kind: ParticleKind;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

const MAX_PARTICLES = 240;

export class ParticlePool {
  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly slots: ParticleSlot[] = [];
  private cursor = 0;

  private readonly dustColor = new THREE.Color(PALETTE.sandstoneLight);
  private readonly goldColor = new THREE.Color(PALETTE.brightGold);
  private readonly warmGoldColor = new THREE.Color(PALETTE.hammeredGold);
  private readonly jadeColor = new THREE.Color(0x4be0a8);
  private readonly amberColor = new THREE.Color(0xffb454);
  private readonly emberColor = new THREE.Color(0xff7733);

  constructor(scene: THREE.Scene, spriteMap: THREE.Texture) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.positions[i * 3 + 1] = -999;
      this.slots.push({
        active: false,
        kind: 'dust',
        age: 0,
        life: 1,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.44,
      map: spriteMap,
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private alloc(): ParticleSlot {
    const slot = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return slot;
  }

  public spawnDust(x: number, y: number, z: number, count = 4, spread = 0.45): void {
    for (let i = 0; i < count; i++) {
      const slot = this.alloc();
      slot.active = true;
      slot.kind = 'dust';
      slot.age = 0;
      slot.life = 0.34 + Math.random() * 0.24;
      slot.x = x + (Math.random() - 0.5) * spread;
      slot.y = y + 0.08 + Math.random() * 0.14;
      slot.z = z + (Math.random() - 0.5) * 0.25;
      slot.vx = (Math.random() - 0.5) * 1.4;
      slot.vy = 0.65 + Math.random() * 1.1;
      slot.vz = 1.6 + Math.random() * 2.2;
    }
  }

  public spawnGoldTrail(x: number, y: number, z: number, count = 4): void {
    for (let i = 0; i < count; i++) {
      const slot = this.alloc();
      slot.active = true;
      slot.kind = 'gold';
      slot.age = 0;
      slot.life = 0.38 + Math.random() * 0.22;
      slot.x = x + (Math.random() - 0.5) * 0.42;
      slot.y = y + 0.12 + Math.random() * 0.28;
      slot.z = z + 0.15 + Math.random() * 0.2;
      slot.vx = (Math.random() - 0.5) * 1.2;
      slot.vy = 0.9 + Math.random() * 1.4;
      slot.vz = 2.4 + Math.random() * 1.8;
    }
  }

  public spawnJadeTrail(x: number, y: number, z: number, count = 4): void {
    for (let i = 0; i < count; i++) {
      const slot = this.alloc();
      slot.active = true;
      slot.kind = 'jade';
      slot.age = 0;
      slot.life = 0.42 + Math.random() * 0.22;
      slot.x = x + (Math.random() - 0.5) * 0.45;
      slot.y = y + 0.14 + Math.random() * 0.34;
      slot.z = z + 0.15 + Math.random() * 0.2;
      slot.vx = (Math.random() - 0.5) * 1.3;
      slot.vy = 1.0 + Math.random() * 1.3;
      slot.vz = 2.2 + Math.random() * 1.8;
    }
  }

  public spawnCoinBurst(x: number, y: number, z: number, count = 14): void {
    for (let i = 0; i < count; i++) {
      const slot = this.alloc();
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      const spd = 2.1 + Math.random() * 2.6;
      slot.active = true;
      slot.kind = 'gold';
      slot.age = 0;
      slot.life = 0.38 + Math.random() * 0.26;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = Math.cos(angle) * spd;
      slot.vy = 1.8 + Math.random() * 3.1;
      slot.vz = Math.sin(angle) * spd * 0.65;
    }
  }

  public spawnAmberShatter(x: number, y: number, z: number, count = 24): void {
    for (let i = 0; i < count; i++) {
      const slot = this.alloc();
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 3.2 + Math.random() * 3.8;
      slot.active = true;
      slot.kind = 'amber';
      slot.age = 0;
      slot.life = 0.48 + Math.random() * 0.28;
      slot.x = x;
      slot.y = y + 0.9;
      slot.z = z;
      slot.vx = Math.cos(angle) * spd;
      slot.vy = 2.0 + Math.random() * 4.2;
      slot.vz = Math.sin(angle) * spd;
    }
  }

  public spawnVaultEmber(x: number, y: number, z: number): void {
    const slot = this.alloc();
    slot.active = true;
    slot.kind = 'ember';
    slot.age = 0;
    slot.life = 1.1 + Math.random() * 0.7;
    slot.x = x + (Math.random() - 0.5) * 0.5;
    slot.y = y;
    slot.z = z + (Math.random() - 0.5) * 0.5;
    slot.vx = (Math.random() - 0.5) * 0.8;
    slot.vy = 1.4 + Math.random() * 1.8;
    slot.vz = 0;
  }

  public update(dt: number, forwardSpeed: number): void {
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = this.slots[i];
      if (!s.active) continue;
      dirty = true;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        this.positions[i * 3 + 1] = -999;
        continue;
      }

      const t = s.age / s.life;
      if (s.kind === 'dust') {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += (s.vz + forwardSpeed * 0.38) * dt;
        s.vy *= Math.exp(-3.5 * dt);
        const fade = 1 - t;
        this.colors[i * 3] = this.dustColor.r * fade;
        this.colors[i * 3 + 1] = this.dustColor.g * fade;
        this.colors[i * 3 + 2] = this.dustColor.b * fade;
      } else if (s.kind === 'jade') {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += (s.vz + forwardSpeed * 0.32) * dt;
        s.vy *= Math.exp(-2.8 * dt);
        const fade = 1 - t * t;
        this.colors[i * 3] = this.jadeColor.r * fade * 1.25;
        this.colors[i * 3 + 1] = this.jadeColor.g * fade * 1.25;
        this.colors[i * 3 + 2] = this.jadeColor.b * fade * 1.25;
      } else if (s.kind === 'ember') {
        s.x += s.vx * dt + Math.sin(s.age * 7 + i) * 0.4 * dt;
        s.y += s.vy * dt;
        s.z += forwardSpeed * dt;
        const fade = 1 - t;
        this.colors[i * 3] = this.emberColor.r * fade * 1.4;
        this.colors[i * 3 + 1] = this.emberColor.g * fade * 1.4;
        this.colors[i * 3 + 2] = this.emberColor.b * fade * 1.4;
      } else if (s.kind === 'amber') {
        s.vy -= 11.5 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += (s.vz + forwardSpeed * 0.15) * dt;
        const fade = 1 - t * t;
        this.colors[i * 3] = this.amberColor.r * fade * 1.35;
        this.colors[i * 3 + 1] = this.amberColor.g * fade * 1.35;
        this.colors[i * 3 + 2] = this.amberColor.b * fade * 1.35;
      } else {
        s.vy -= 8.0 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += (s.vz + forwardSpeed * 0.24) * dt;
        const fade = 1 - t * t;
        this.colors[i * 3] = THREE.MathUtils.lerp(this.goldColor.r, this.warmGoldColor.r, t) * fade * 1.3;
        this.colors[i * 3 + 1] = THREE.MathUtils.lerp(this.goldColor.g, this.warmGoldColor.g, t) * fade * 1.3;
        this.colors[i * 3 + 2] = THREE.MathUtils.lerp(this.goldColor.b, this.warmGoldColor.b, t) * fade * 1.3;
      }

      this.positions[i * 3] = s.x;
      this.positions[i * 3 + 1] = s.y;
      this.positions[i * 3 + 2] = s.z;
    }

    if (dirty) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
    }
  }

  public clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.slots[i].active = false;
      this.positions[i * 3 + 1] = -999;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
