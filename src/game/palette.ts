export const PALETTE = {
  // Atmospheric & Lighting
  sunlight: 0xffdda1,
  hemiSky: 0x2a4d59,
  hemiGround: 0x5c7a58,
  fogMist: 0xe6ccb2,

  // Strict Material Palette
  sandstone: 0xd4a373,
  sandstoneLight: 0xe2ba8f,
  sandstoneDark: 0xb07d52,
  mossGreen: 0x588157,
  mossDark: 0x3a5a40,
  ancientTimber: 0x4a3525,
  timberHighlight: 0x6b4f39,
  shadowSlate: 0x264653,
  slateDark: 0x1b323b,
  hammeredGold: 0xf4a261,
  brightGold: 0xffd166,

  // Explorer & Relic Accents
  terracottaScarf: 0xc24936,
  explorerHat: 0x5a412d,
  explorerTunic: 0xe7d3b5,
  explorerLeather: 0x3d291c,
  jadeRelic: 0x38a37f,
  amberRelic: 0xf4a261,
} as const;

export const GAME_CONFIG = {
  laneWidth: 2.65,
  causewayWidth: 9.2,
  baseSpeed: 15.8,
  maxSpeed: 34.0,
  speedRampPerSec: 0.23,
  jumpVelocity: 14.0,
  gravity: 36.5,
  fastFallGravity: 94.0,
  slideDuration: 0.72,
  jumpBufferWindow: 0.16,
  turnBufferWindow: 0.28,
  segmentLength: 24,
  segmentCount: 8,
  biomeIntervalMeters: 500,
  chaserDuration: 8.5,
  nearMissBonus: 25,
} as const;

export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';
export type RunMode = 'endless' | 'daily';
export type BiomeId = 'courtyard' | 'aqueduct' | 'vault';
export type PowerUpKind = 'magnet' | 'shield' | 'dash';
export type TurnKind = 'left' | 'right' | 'tee';
export type OutfitId = 'sandstone' | 'crimson' | 'emerald' | 'sunking';
export type TrailId = 'dust' | 'gold' | 'jade';
export type CharacterId = 'explorer' | 'panda' | 'ronin';
export type NairaValue = 10;

export interface NairaDenomination {
  value: NairaValue;
  label: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  edgeHex: number;
}

export const NAIRA_DENOMINATIONS: NairaDenomination[] = [
  {
    value: 10,
    label: '₦10',
    primaryHex: '#9e2632',
    secondaryHex: '#c9434f',
    accentHex: '#fff0d6',
    edgeHex: 0x9e2632,
  },
];

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  subtitle: string;
  description: string;
  cost: number;
  swatchHex: string;
  imageUrl: string | null;
}

export const CHARACTERS: CharacterConfig[] = [
  {
    id: 'explorer',
    name: 'Sandstone Explorer',
    subtitle: 'Temple Pathfinder',
    description: 'Sun-bleached explorer attire, brimmed hat, and flowing scarf.',
    cost: 0,
    swatchHex: '#d4a373',
    imageUrl: null,
  },
  {
    id: 'panda',
    name: 'Master Panda',
    subtitle: 'Street Kung Fu Legend',
    description: 'Heavy charcoal fleece hoodie, chunky gold chain, and fearless stride.',
    cost: 5000,
    swatchHex: '#4a4e54',
    imageUrl: '/assets/aistudio/Kung_fu_panda_80bc7ca5.jpeg',
  },
  {
    id: 'ronin',
    name: 'Shadow Ronin',
    subtitle: 'Cybernetic Blade Walker',
    description: 'Obsidian chrome armor, woven kasa hat, and twin back-mounted katanas.',
    cost: 10000,
    swatchHex: '#1d2128',
    imageUrl: '/assets/aistudio/1111052170614116713_644ee608.jpeg',
  },
];

export function formatNaira(amount: number): string {
  return `₦${Math.max(0, Math.floor(amount)).toLocaleString()}`;
}

export interface BiomeDefinition {
  id: BiomeId;
  name: string;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogColor: number;
  fogDensity: number;
  waterOpacity: number;
  brazierIntensity: number;
  stoneTint: number;
}

export const BIOMES: Record<BiomeId, BiomeDefinition> = {
  courtyard: {
    id: 'courtyard',
    name: 'Overgrown Courtyard',
    sunColor: 0xffdda1,
    sunIntensity: 2.55,
    hemiSky: 0x2a4d59,
    hemiGround: 0x5c7a58,
    hemiIntensity: 1.18,
    fogColor: 0xe6ccb2,
    fogDensity: 0.0145,
    waterOpacity: 0.0,
    brazierIntensity: 0.0,
    stoneTint: 0xffffff,
  },
  aqueduct: {
    id: 'aqueduct',
    name: 'Sunken Aqueducts',
    sunColor: 0xdff6ef,
    sunIntensity: 2.25,
    hemiSky: 0x2f6b75,
    hemiGround: 0x45736e,
    hemiIntensity: 1.25,
    fogColor: 0xa7d5d0,
    fogDensity: 0.0155,
    waterOpacity: 0.92,
    brazierIntensity: 0.0,
    stoneTint: 0xd9ece8,
  },
  vault: {
    id: 'vault',
    name: 'Torchlit Vaults',
    sunColor: 0xffb36b,
    sunIntensity: 1.45,
    hemiSky: 0x1e2b38,
    hemiGround: 0x4a3123,
    hemiIntensity: 0.92,
    fogColor: 0x232a33,
    fogDensity: 0.0185,
    waterOpacity: 0.0,
    brazierIntensity: 1.0,
    stoneTint: 0x9aa4ad,
  },
};

export interface OutfitConfig {
  id: OutfitId;
  name: string;
  description: string;
  cost: number;
  tunic: number;
  coatLower: number;
  hat: number;
  scarf: number;
  pants: number;
  accent: number;
  swatchHex: string;
}

export const OUTFITS: OutfitConfig[] = [
  {
    id: 'sandstone',
    name: 'Sandstone Explorer',
    description: 'Sun-bleached linen tunic and terracotta scarf.',
    cost: 0,
    tunic: 0xe7d3b5,
    coatLower: 0xcab08e,
    hat: 0x5a412d,
    scarf: 0xc24936,
    pants: 0x264653,
    accent: 0xffd166,
    swatchHex: '#e7d3b5',
  },
  {
    id: 'crimson',
    name: 'Crimson Nomad',
    description: 'Deep desert carmine mantle with bronze trim.',
    cost: 2000,
    tunic: 0x9b2c2c,
    coatLower: 0x6f1d1b,
    hat: 0x3b221a,
    scarf: 0xf4a261,
    pants: 0x2c2220,
    accent: 0xf4a261,
    swatchHex: '#9b2c2c',
  },
  {
    id: 'emerald',
    name: 'Emerald Jungle Scout',
    description: 'Canopy-dyed scout garb woven for wet aqueducts.',
    cost: 3500,
    tunic: 0x3e6b4e,
    coatLower: 0x294c38,
    hat: 0x3a2f22,
    scarf: 0xb7d18c,
    pants: 0x233831,
    accent: 0x8ad19c,
    swatchHex: '#3e6b4e',
  },
  {
    id: 'sunking',
    name: 'Sun-King Regalia',
    description: 'Obsidian slate vestments edged in hammered gold.',
    cost: 5000,
    tunic: 0x23343d,
    coatLower: 0x162229,
    hat: 0x1c2830,
    scarf: 0xffd166,
    pants: 0x162229,
    accent: 0xffd166,
    swatchHex: '#ffd166',
  },
];

export interface TrailConfig {
  id: TrailId;
  name: string;
  description: string;
  cost: number;
  swatchHex: string;
}

export const TRAILS: TrailConfig[] = [
  {
    id: 'dust',
    name: 'Sandstone Dust',
    description: 'Subtle warm dust puffs kicked up on each stride.',
    cost: 0,
    swatchHex: '#d4a373',
  },
  {
    id: 'gold',
    name: 'Golden Footsteps',
    description: 'Luminous hammered-gold sparks trailing behind your boots.',
    cost: 2500,
    swatchHex: '#ffd166',
  },
  {
    id: 'jade',
    name: 'Jade Relic Wisps',
    description: 'Cool temple jade motes drifting off every sprint.',
    cost: 4000,
    swatchHex: '#38a37f',
  },
];

export interface RelicUpgrades {
  magnetLevel: number; // 0..3 -> 8s, 10s, 12s, 14s
  shieldLevel: number; // 0..3 -> invuln grace + bonus gold on shatter
  dashLevel: number;   // 0..3 -> 4.5s, 5.5s, 6.5s, 7.5s
  headStartLevel: number; // 0..3 -> 0m, 100m, 200m, 300m head-start dash
}

export interface LastRunSummary {
  mode: RunMode;
  distance: number;
  coins: number;
  biomeName: string;
  dailySeedDate: string;
  endedAt: number;
}

export interface SavedRunSnapshot {
  mode: RunMode;
  dailySeedDate: string;
  distance: number;
  coins: number;
  speed: number;
  isNewRecord: boolean;
  biome: BiomeId;
  biomeName: string;
  targetLane: number;
  hasShield: boolean;
  magnetRemaining: number;
  dashRemaining: number;
  chaserTimeLeft: number;
  savedAt: number;
}

export interface PlayerProfile {
  totalCoins: number;
  highScoreEndless: number;
  dailySeedDate: string;
  highScoreDaily: number;
  upgrades: RelicUpgrades;
  unlockedCharacters: CharacterId[];
  equippedCharacter: CharacterId;
  unlockedOutfits: OutfitId[];
  equippedOutfit: OutfitId;
  unlockedTrails: TrailId[];
  equippedTrail: TrailId;
  preferredMode: RunMode;
  muted: boolean;
  lastRun: LastRunSummary | null;
}

export interface RunTelemetry {
  phase: GamePhase;
  mode: RunMode;
  dailySeedDate: string;
  distance: number;
  coins: number;
  highScore: number;
  isNewRecord: boolean;
  speedRatio: number;
  biome: BiomeId;
  biomeName: string;
  magnetRemaining: number;
  magnetMax: number;
  hasShield: boolean;
  dashRemaining: number;
  dashMax: number;
  chaserActive: boolean;
  chaserTimeLeft: number;
  pendingTurn: TurnKind | null;
  nearMissEventId: number;
  nearMissLabel: string;
}

export function getDailySeedDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function hashDateToSeed(dateStr: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
