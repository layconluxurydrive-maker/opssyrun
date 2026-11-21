import {
  BIOMES,
  CHARACTERS,
  GAME_CONFIG,
  getDailySeedDateString,
  OUTFITS,
  TRAILS,
  type BiomeId,
  type CharacterId,
  type LastRunSummary,
  type OutfitId,
  type PlayerProfile,
  type RelicUpgrades,
  type RunMode,
  type SavedRunSnapshot,
  type TrailId,
} from './palette';

const PROFILE_STORAGE_KEY = 'sunken_ruins_profile_v1';
const ACTIVE_RUN_STORAGE_KEY = 'sunken_ruins_active_run_v1';
const LEGACY_BEST_KEY = 'sunken_ruins_best_distance_v1';

export type UpgradeKey = keyof RelicUpgrades;

export const UPGRADE_META: Record<
  UpgradeKey,
  {
    name: string;
    description: string;
    maxLevel: number;
    costs: number[];
    effectLabel: (level: number) => string;
  }
> = {
  magnetLevel: {
    name: 'Jade Magnet',
    description: 'Extends the reach and duration of magnetic Naira pull.',
    maxLevel: 3,
    costs: [1500, 3000, 5000],
    effectLabel: (lv) => `${8 + lv * 2}s duration`,
  },
  shieldLevel: {
    name: 'Amber Aegis',
    description: 'Adds grace invulnerability and bonus Naira when shattering.',
    maxLevel: 3,
    costs: [2000, 3500, 5500],
    effectLabel: (lv) => `${(1.2 + lv * 0.4).toFixed(1)}s grace · +₦${lv * 250}`,
  },
  dashLevel: {
    name: 'Sunburst Dash',
    description: 'Prolongs 2x solar dash speed and auto-turn protection.',
    maxLevel: 3,
    costs: [2000, 4000, 6000],
    effectLabel: (lv) => `${(4.5 + lv * 1.0).toFixed(1)}s dash`,
  },
  headStartLevel: {
    name: 'Solar Head-Start',
    description: 'Launch directly from the temple gate in a Sunburst surge.',
    maxLevel: 3,
    costs: [2500, 4500, 7500],
    effectLabel: (lv) => (lv === 0 ? 'Inactive' : `${lv * 100}m surge`),
  },
};

export function getDefaultProfile(): PlayerProfile {
  let legacyBest = 0;
  try {
    const saved = window.localStorage.getItem(LEGACY_BEST_KEY);
    legacyBest = saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
  } catch {
    legacyBest = 0;
  }

  return {
    totalCoins: 0,
    highScoreEndless: legacyBest,
    dailySeedDate: getDailySeedDateString(),
    highScoreDaily: 0,
    upgrades: {
      magnetLevel: 0,
      shieldLevel: 0,
      dashLevel: 0,
      headStartLevel: 0,
    },
    unlockedCharacters: ['explorer'],
    equippedCharacter: 'explorer',
    unlockedOutfits: ['sandstone'],
    equippedOutfit: 'sandstone',
    unlockedTrails: ['dust'],
    equippedTrail: 'dust',
    preferredMode: 'endless',
    muted: false,
    lastRun: null,
  };
}

export function loadProfile(): PlayerProfile {
  const def = getDefaultProfile();
  const today = getDailySeedDateString();
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    const sameDay = parsed.dailySeedDate === today;

    return {
      totalCoins: Math.max(0, Math.floor(parsed.totalCoins ?? def.totalCoins)),
      highScoreEndless: Math.max(def.highScoreEndless, Math.floor(parsed.highScoreEndless ?? 0)),
      dailySeedDate: today,
      highScoreDaily: sameDay ? Math.max(0, Math.floor(parsed.highScoreDaily ?? 0)) : 0,
      upgrades: {
        magnetLevel: clampLevel(parsed.upgrades?.magnetLevel, 3),
        shieldLevel: clampLevel(parsed.upgrades?.shieldLevel, 3),
        dashLevel: clampLevel(parsed.upgrades?.dashLevel, 3),
        headStartLevel: clampLevel(parsed.upgrades?.headStartLevel, 3),
      },
      unlockedCharacters: sanitizeCharacters(parsed.unlockedCharacters),
      equippedCharacter: isValidCharacter(parsed.equippedCharacter)
        ? parsed.equippedCharacter
        : 'explorer',
      unlockedOutfits: sanitizeOutfits(parsed.unlockedOutfits),
      equippedOutfit: isValidOutfit(parsed.equippedOutfit) ? parsed.equippedOutfit : 'sandstone',
      unlockedTrails: sanitizeTrails(parsed.unlockedTrails),
      equippedTrail: isValidTrail(parsed.equippedTrail) ? parsed.equippedTrail : 'dust',
      preferredMode: isValidMode(parsed.preferredMode) ? parsed.preferredMode : 'endless',
      muted: Boolean(parsed.muted),
      lastRun: sanitizeLastRun(parsed.lastRun),
    };
  } catch {
    return def;
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedRun(): SavedRunSnapshot | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedRunSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;

    const mode: RunMode = isValidMode(parsed.mode) ? parsed.mode : 'endless';
    const distance = Math.max(0, Math.floor(Number(parsed.distance) || 0));
    const coins = Math.max(0, Math.floor(Number(parsed.coins) || 0));
    if (distance < 5 && coins <= 0) return null;

    const biome: BiomeId = isValidBiome(parsed.biome) ? parsed.biome : 'courtyard';
    const speed = Math.max(
      GAME_CONFIG.baseSpeed,
      Math.min(GAME_CONFIG.maxSpeed, Number(parsed.speed) || GAME_CONFIG.baseSpeed)
    );
    const targetLane = Math.max(-1, Math.min(1, Math.round(Number(parsed.targetLane) || 0)));

    return {
      mode,
      dailySeedDate:
        typeof parsed.dailySeedDate === 'string' && parsed.dailySeedDate.length >= 8
          ? parsed.dailySeedDate
          : getDailySeedDateString(),
      distance,
      coins,
      speed,
      isNewRecord: Boolean(parsed.isNewRecord),
      biome,
      biomeName: BIOMES[biome].name,
      targetLane,
      hasShield: Boolean(parsed.hasShield),
      magnetRemaining: Math.max(0, Number(parsed.magnetRemaining) || 0),
      dashRemaining: Math.max(0, Number(parsed.dashRemaining) || 0),
      chaserTimeLeft: Math.max(0, Math.min(GAME_CONFIG.chaserDuration, Number(parsed.chaserTimeLeft) || 0)),
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveRunSnapshot(snapshot: SavedRunSnapshot): void {
  try {
    window.localStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearSavedRun(): void {
  try {
    window.localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function isSavedRunResumable(snapshot: SavedRunSnapshot | null): snapshot is SavedRunSnapshot {
  if (!snapshot) return false;
  if (snapshot.distance < 5 && snapshot.coins <= 0) return false;
  if (snapshot.mode === 'daily' && snapshot.dailySeedDate !== getDailySeedDateString()) {
    return false;
  }
  return true;
}

export function finalizeAbandonedRun(
  profile: PlayerProfile,
  snapshot: SavedRunSnapshot
): PlayerProfile {
  const today = getDailySeedDateString();
  const sameDayAsToday = snapshot.dailySeedDate === today;
  const profileSameDay = profile.dailySeedDate === today;

  const nextProfile: PlayerProfile = {
    ...profile,
    totalCoins: profile.totalCoins + snapshot.coins,
    highScoreEndless:
      snapshot.mode === 'endless'
        ? Math.max(profile.highScoreEndless, snapshot.distance)
        : profile.highScoreEndless,
    dailySeedDate: today,
    highScoreDaily:
      snapshot.mode === 'daily' && sameDayAsToday
        ? Math.max(profileSameDay ? profile.highScoreDaily : 0, snapshot.distance)
        : profileSameDay
          ? profile.highScoreDaily
          : 0,
    lastRun: {
      mode: snapshot.mode,
      distance: snapshot.distance,
      coins: snapshot.coins,
      biomeName: snapshot.biomeName,
      dailySeedDate: snapshot.dailySeedDate,
      endedAt: snapshot.savedAt || Date.now(),
    },
  };

  saveProfile(nextProfile);
  clearSavedRun();
  return nextProfile;
}

function clampLevel(val: unknown, max: number): number {
  const n = typeof val === 'number' ? Math.floor(val) : 0;
  return Math.max(0, Math.min(max, n));
}

function isValidMode(mode: unknown): mode is RunMode {
  return mode === 'endless' || mode === 'daily';
}

function isValidBiome(biome: unknown): biome is BiomeId {
  return biome === 'courtyard' || biome === 'aqueduct' || biome === 'vault';
}

function isValidCharacter(id: unknown): id is CharacterId {
  return CHARACTERS.some((c) => c.id === id);
}

function isValidOutfit(id: unknown): id is OutfitId {
  return OUTFITS.some((o) => o.id === id);
}

function isValidTrail(id: unknown): id is TrailId {
  return TRAILS.some((t) => t.id === id);
}

function sanitizeCharacters(list: unknown): CharacterId[] {
  const set = new Set<CharacterId>(['explorer']);
  if (Array.isArray(list)) {
    for (const item of list) {
      if (isValidCharacter(item)) set.add(item);
    }
  }
  return Array.from(set);
}

function sanitizeLastRun(raw: unknown): LastRunSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<LastRunSummary>;
  const distance = Math.max(0, Math.floor(Number(r.distance) || 0));
  const coins = Math.max(0, Math.floor(Number(r.coins) || 0));
  if (distance <= 0 && coins <= 0) return null;
  return {
    mode: isValidMode(r.mode) ? r.mode : 'endless',
    distance,
    coins,
    biomeName: typeof r.biomeName === 'string' && r.biomeName ? r.biomeName : BIOMES.courtyard.name,
    dailySeedDate:
      typeof r.dailySeedDate === 'string' && r.dailySeedDate ? r.dailySeedDate : getDailySeedDateString(),
    endedAt: typeof r.endedAt === 'number' ? r.endedAt : Date.now(),
  };
}

function sanitizeOutfits(list: unknown): OutfitId[] {
  const set = new Set<OutfitId>(['sandstone']);
  if (Array.isArray(list)) {
    for (const item of list) {
      if (isValidOutfit(item)) set.add(item);
    }
  }
  return Array.from(set);
}

function sanitizeTrails(list: unknown): TrailId[] {
  const set = new Set<TrailId>(['dust']);
  if (Array.isArray(list)) {
    for (const item of list) {
      if (isValidTrail(item)) set.add(item);
    }
  }
  return Array.from(set);
}
