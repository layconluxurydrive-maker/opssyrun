import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Calendar,
  Compass,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { RelicVaultOverlay, type VaultTab } from './components/RelicVaultOverlay';
import { SunkenRuinsEngine } from './game/engine';
import {
  CHARACTERS,
  formatNaira,
  getDailySeedDateString,
  OUTFITS,
  TRAILS,
  type CharacterId,
  type OutfitId,
  type PlayerProfile,
  type RunMode,
  type RunTelemetry,
  type SavedRunSnapshot,
  type TrailId,
} from './game/palette';
import {
  clearSavedRun,
  finalizeAbandonedRun,
  isSavedRunResumable,
  loadProfile,
  loadSavedRun,
  saveProfile,
  saveRunSnapshot,
  UPGRADE_META,
  type UpgradeKey,
} from './game/profile';

const INITIAL_TELEMETRY: RunTelemetry = {
  phase: 'title',
  mode: 'endless',
  dailySeedDate: getDailySeedDateString(),
  distance: 0,
  coins: 0,
  highScore: 0,
  isNewRecord: false,
  speedRatio: 0,
  biome: 'courtyard',
  biomeName: 'Overgrown Courtyard',
  magnetRemaining: 0,
  magnetMax: 8,
  hasShield: false,
  dashRemaining: 0,
  dashMax: 4.5,
  chaserActive: false,
  chaserTimeLeft: 0,
  pendingTurn: null,
  nearMissEventId: 0,
  nearMissLabel: '',
};

function bootstrapSavedProgress(): {
  profile: PlayerProfile;
  savedRun: SavedRunSnapshot | null;
} {
  const loadedProfile = loadProfile();
  const loadedRun = loadSavedRun();
  if (!loadedRun) {
    return { profile: loadedProfile, savedRun: null };
  }
  if (!isSavedRunResumable(loadedRun)) {
    // Expired daily run (from a prior day) or invalid: bank its gold & score so nothing is lost
    const banked = finalizeAbandonedRun(loadedProfile, loadedRun);
    return { profile: banked, savedRun: null };
  }
  return { profile: loadedProfile, savedRun: loadedRun };
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SunkenRuinsEngine | null>(null);

  const initialBootstrapRef = useRef<{
    profile: PlayerProfile;
    savedRun: SavedRunSnapshot | null;
  } | null>(null);
  if (!initialBootstrapRef.current) {
    initialBootstrapRef.current = bootstrapSavedProgress();
  }

  const [profile, setProfile] = useState<PlayerProfile>(initialBootstrapRef.current.profile);
  const [savedRun, setSavedRun] = useState<SavedRunSnapshot | null>(
    initialBootstrapRef.current.savedRun
  );
  const [selectedMode, setSelectedMode] = useState<RunMode>(
    initialBootstrapRef.current.profile.preferredMode
  );
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultTab, setVaultTab] = useState<VaultTab>('characters');

  const [telemetry, setTelemetry] = useState<RunTelemetry>(() => {
    const p = initialBootstrapRef.current!.profile;
    return {
      ...INITIAL_TELEMETRY,
      mode: p.preferredMode,
      highScore: p.preferredMode === 'daily' ? p.highScoreDaily : p.highScoreEndless,
    };
  });
  const [muted, setMuted] = useState<boolean>(initialBootstrapRef.current.profile.muted);
  const [contextLost, setContextLost] = useState(false);
  const [activeNearMissId, setActiveNearMissId] = useState(0);

  const profileRef = useRef<PlayerProfile>(profile);
  profileRef.current = profile;
  const savedRunRef = useRef<SavedRunSnapshot | null>(savedRun);
  savedRunRef.current = savedRun;

  const touchStartRef = useRef<{ x: number; y: number; handled: boolean } | null>(null);

  // Sync near-miss banner fade
  useEffect(() => {
    if (telemetry.nearMissEventId > 0) {
      setActiveNearMissId(telemetry.nearMissEventId);
      const timer = window.setTimeout(() => {
        setActiveNearMissId((curr) => (curr === telemetry.nearMissEventId ? 0 : curr));
      }, 1150);
      return () => window.clearTimeout(timer);
    }
  }, [telemetry.nearMissEventId]);

  const persistCheckpoint = useCallback((snapshot: SavedRunSnapshot | null) => {
    if (!snapshot) return;
    saveRunSnapshot(snapshot);
    savedRunRef.current = snapshot;

    // Persist live high score record mid-run so closing mid-run never loses a broken record
    setProfile((prev) => {
      const today = getDailySeedDateString();
      const sameDay = prev.dailySeedDate === today;
      const prevDaily = sameDay ? prev.highScoreDaily : 0;

      const needsEndlessUpdate =
        snapshot.mode === 'endless' && snapshot.distance > prev.highScoreEndless;
      const needsDailyUpdate =
        snapshot.mode === 'daily' &&
        snapshot.dailySeedDate === today &&
        snapshot.distance > prevDaily;

      if (!needsEndlessUpdate && !needsDailyUpdate) return prev;

      const nextProfile: PlayerProfile = {
        ...prev,
        highScoreEndless: needsEndlessUpdate ? snapshot.distance : prev.highScoreEndless,
        dailySeedDate: today,
        highScoreDaily: needsDailyUpdate ? snapshot.distance : prevDaily,
      };
      saveProfile(nextProfile);
      profileRef.current = nextProfile;
      return nextProfile;
    });
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const initial = profileRef.current;
    const engine = new SunkenRuinsEngine(
      mount,
      {
        onTelemetry: (next) => {
          setTelemetry(next);
        },
        onCheckpoint: (snapshot) => {
          persistCheckpoint(snapshot);
        },
        onRunEnded: ({ mode, distance, coins, biomeName, dailySeedDate }) => {
          clearSavedRun();
          savedRunRef.current = null;
          setSavedRun(null);

          setProfile((prev) => {
            const sameDay = prev.dailySeedDate === dailySeedDate;
            const nextProfile: PlayerProfile = {
              ...prev,
              totalCoins: prev.totalCoins + coins,
              highScoreEndless:
                mode === 'endless' ? Math.max(prev.highScoreEndless, distance) : prev.highScoreEndless,
              dailySeedDate,
              highScoreDaily:
                mode === 'daily'
                  ? Math.max(sameDay ? prev.highScoreDaily : 0, distance)
                  : sameDay
                    ? prev.highScoreDaily
                    : 0,
              lastRun: {
                mode,
                distance,
                coins,
                biomeName,
                dailySeedDate,
                endedAt: Date.now(),
              },
            };
            saveProfile(nextProfile);
            profileRef.current = nextProfile;
            engineRef.current?.applyProfile(nextProfile);
            return nextProfile;
          });
        },
        onContextStatus: (lost) => {
          setContextLost(lost);
        },
      },
      initial
    );
    engineRef.current = engine;

    const flushProgressToStorage = () => {
      const snap = engine.getRunSnapshot();
      if (snap) {
        persistCheckpoint(snap);
      } else {
        saveProfile(profileRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushProgressToStorage();
      }
    };

    window.addEventListener('pagehide', flushProgressToStorage);
    window.addEventListener('beforeunload', flushProgressToStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      flushProgressToStorage();
      window.removeEventListener('pagehide', flushProgressToStorage);
      window.removeEventListener('beforeunload', flushProgressToStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      engineRef.current = null;
      engine.dispose();
    };
  }, [persistCheckpoint]);

  const handleModeChange = useCallback((mode: RunMode) => {
    setSelectedMode(mode);
    engineRef.current?.setMode(mode);
    setProfile((prev) => {
      if (prev.preferredMode === mode) return prev;
      const next: PlayerProfile = { ...prev, preferredMode: mode };
      saveProfile(next);
      profileRef.current = next;
      engineRef.current?.applyProfile(next);
      return next;
    });
  }, []);

  const handleStartOrRestart = useCallback(() => {
    if (vaultOpen) return;
    const engine = engineRef.current;
    if (!engine) return;

    // Bank any unbanked active run snapshot (from paused restart or abandoned title resume)
    const pendingSnapshot = engine.getRunSnapshot() ?? savedRunRef.current;
    if (pendingSnapshot) {
      const banked = finalizeAbandonedRun(profileRef.current, pendingSnapshot);
      profileRef.current = banked;
      setProfile(banked);
      engine.applyProfile(banked);
    } else {
      clearSavedRun();
    }
    savedRunRef.current = null;
    setSavedRun(null);

    engine.startRun(selectedMode);
  }, [selectedMode, vaultOpen]);

  const handleResumeSavedRun = useCallback(() => {
    if (vaultOpen) return;
    const engine = engineRef.current;
    const snap = savedRunRef.current;
    if (!engine || !snap || !isSavedRunResumable(snap)) return;

    setSelectedMode(snap.mode);
    setProfile((prev) => {
      if (prev.preferredMode === snap.mode) return prev;
      const next: PlayerProfile = { ...prev, preferredMode: snap.mode };
      saveProfile(next);
      profileRef.current = next;
      engine.applyProfile(next);
      return next;
    });

    engine.resumeRun(snap);
  }, [vaultOpen]);

  const handleReturnToTitle = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const activeSnap = engine.getRunSnapshot();
    if (activeSnap) {
      persistCheckpoint(activeSnap);
      setSavedRun(activeSnap);
    }
    engine.returnToTitle();
  }, [persistCheckpoint]);

  const handleToggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const nextMuted = engine.toggleMute();
    setMuted(nextMuted);
    setProfile((prev) => {
      const next: PlayerProfile = { ...prev, muted: nextMuted };
      saveProfile(next);
      profileRef.current = next;
      return next;
    });
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleUpgrade = useCallback((key: UpgradeKey) => {
    setProfile((prev) => {
      const meta = UPGRADE_META[key];
      const lv = prev.upgrades[key];
      if (lv >= meta.maxLevel) return prev;
      const cost = meta.costs[lv];
      if (prev.totalCoins < cost) return prev;

      const next: PlayerProfile = {
        ...prev,
        totalCoins: prev.totalCoins - cost,
        upgrades: {
          ...prev.upgrades,
          [key]: lv + 1,
        },
      };
      saveProfile(next);
      engineRef.current?.applyProfile(next);
      engineRef.current?.playUpgradeChime();
      return next;
    });
  }, []);

  const handleSelectOutfit = useCallback((id: OutfitId) => {
    const cfg = OUTFITS.find((o) => o.id === id);
    if (!cfg) return;
    setProfile((prev) => {
      const unlocked = prev.unlockedOutfits.includes(id);
      if (!unlocked && prev.totalCoins < cfg.cost) return prev;

      const next: PlayerProfile = {
        ...prev,
        totalCoins: unlocked ? prev.totalCoins : prev.totalCoins - cfg.cost,
        unlockedOutfits: unlocked ? prev.unlockedOutfits : [...prev.unlockedOutfits, id],
        equippedOutfit: id,
      };
      saveProfile(next);
      engineRef.current?.applyProfile(next);
      engineRef.current?.playUpgradeChime();
      return next;
    });
  }, []);

  const handleSelectCharacter = useCallback((id: CharacterId) => {
    const cfg = CHARACTERS.find((c) => c.id === id);
    if (!cfg) return;
    setProfile((prev) => {
      const unlocked = prev.unlockedCharacters.includes(id);
      if (!unlocked && prev.totalCoins < cfg.cost) return prev;

      const next: PlayerProfile = {
        ...prev,
        totalCoins: unlocked ? prev.totalCoins : prev.totalCoins - cfg.cost,
        unlockedCharacters: unlocked
          ? prev.unlockedCharacters
          : [...prev.unlockedCharacters, id],
        equippedCharacter: id,
      };
      saveProfile(next);
      profileRef.current = next;
      engineRef.current?.applyProfile(next);
      engineRef.current?.playUpgradeChime();
      return next;
    });
  }, []);

  const handleSelectTrail = useCallback((id: TrailId) => {
    const cfg = TRAILS.find((t) => t.id === id);
    if (!cfg) return;
    setProfile((prev) => {
      const unlocked = prev.unlockedTrails.includes(id);
      if (!unlocked && prev.totalCoins < cfg.cost) return prev;

      const next: PlayerProfile = {
        ...prev,
        totalCoins: unlocked ? prev.totalCoins : prev.totalCoins - cfg.cost,
        unlockedTrails: unlocked ? prev.unlockedTrails : [...prev.unlockedTrails, id],
        equippedTrail: id,
      };
      saveProfile(next);
      engineRef.current?.applyProfile(next);
      engineRef.current?.playUpgradeChime();
      return next;
    });
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (vaultOpen) {
        if (e.code === 'Escape') {
          setVaultOpen(false);
        }
        return;
      }

      const engine = engineRef.current;
      if (!engine) return;
      const phase = engine.getPhase();

      if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (phase === 'playing' || phase === 'paused') {
          e.preventDefault();
          engine.togglePause();
        }
        return;
      }

      if (phase === 'title' || phase === 'gameover') {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          handleStartOrRestart();
        }
        return;
      }

      if (phase !== 'playing') return;

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault();
          engine.moveLane(-1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault();
          engine.moveLane(1);
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          e.preventDefault();
          engine.jump();
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          engine.slideOrFastFall();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartOrRestart, handleToggleMute, vaultOpen]);

  // Mobile touch swipe controls
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (vaultOpen) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.unlockAudio();

    if (e.touches.length === 0) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, handled: false };
  }, [vaultOpen]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (vaultOpen) return;
    const engine = engineRef.current;
    const start = touchStartRef.current;
    if (!engine || !start || start.handled || e.touches.length === 0) return;

    if (engine.getPhase() !== 'playing') return;

    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const threshold = 26;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    start.handled = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      engine.moveLane(dx < 0 ? -1 : 1);
    } else if (dy < 0) {
      engine.jump();
    } else {
      engine.slideOrFastFall();
    }
  }, [vaultOpen]);

  const handleTouchEnd = useCallback(() => {
    if (vaultOpen) return;
    const engine = engineRef.current;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!engine || !start || start.handled) return;

    if (engine.getPhase() === 'title') {
      handleStartOrRestart();
    }
  }, [handleStartOrRestart, vaultOpen]);

  const {
    phase,
    mode,
    dailySeedDate,
    distance,
    coins,
    highScore,
    isNewRecord,
    biomeName,
    magnetRemaining,
    hasShield,
    dashRemaining,
    chaserActive,
    pendingTurn,
    nearMissLabel,
  } = telemetry;

  const showWindStreaks =
    phase === 'playing' && (dashRemaining > 0 || activeNearMissId > 0);

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#e6ccb2]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {/* Subtle warm top/bottom atmospheric vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(27,50,59,0.28) 0%, rgba(27,50,59,0) 22%, rgba(27,50,59,0) 76%, rgba(27,50,59,0.34) 100%)',
        }}
      />

      {/* Wind-streak speed lines on Close Calls & Sunburst Dash */}
      {showWindStreaks && (
        <svg
          key={dashRemaining > 0 ? 'dash' : `nm-${activeNearMissId}`}
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={`pointer-events-none absolute inset-0 z-10 h-full w-full ${
            dashRemaining > 0 ? 'opacity-65' : 'animate-wind-streak'
          }`}
        >
          <line x1="2" y1="14" x2="22" y2="30" stroke="#ffd166" strokeWidth="0.32" strokeOpacity="0.65" />
          <line x1="98" y1="16" x2="78" y2="32" stroke="#ffd166" strokeWidth="0.32" strokeOpacity="0.65" />
          <line x1="0" y1="54" x2="18" y2="52" stroke="#fff4e2" strokeWidth="0.28" strokeOpacity="0.55" />
          <line x1="100" y1="56" x2="82" y2="54" stroke="#fff4e2" strokeWidth="0.28" strokeOpacity="0.55" />
          <line x1="5" y1="86" x2="24" y2="70" stroke="#ffd166" strokeWidth="0.32" strokeOpacity="0.6" />
          <line x1="95" y1="84" x2="76" y2="68" stroke="#ffd166" strokeWidth="0.32" strokeOpacity="0.6" />
        </svg>
      )}

      {/* WebGL Context Lost Notice */}
      {contextLost && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#1b323b]/85 px-6 text-center text-[#f7ead9]">
          <div>
            <p className="font-display text-2xl tracking-wider">Restoring Temple View</p>
            <p className="mt-2 text-sm text-[#e6ccb2]">Graphics context paused. Resuming shortly.</p>
          </div>
        </div>
      )}

      {/* Top-Right Discreet Utility Buttons */}
      <div className="pointer-events-auto absolute top-5 right-5 z-30 flex items-center gap-2 sm:top-7 sm:right-8">
        {(phase === 'playing' || phase === 'paused') && (
          <button
            type="button"
            onClick={handleTogglePause}
            aria-label={phase === 'paused' ? 'Resume game' : 'Pause game'}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#fff4e2] transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-[#ffd166] active:scale-95"
            style={{ textShadow: '0 2px 10px rgba(22, 36, 43, 0.7)' }}
          >
            {phase === 'paused' ? <Play className="h-5 w-5 drop-shadow" /> : <Pause className="h-5 w-5 drop-shadow" />}
          </button>
        )}
        <button
          type="button"
          onClick={handleToggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#fff4e2] transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-[#ffd166] active:scale-95"
          style={{ textShadow: '0 2px 10px rgba(22, 36, 43, 0.7)' }}
        >
          {muted ? <VolumeX className="h-5 w-5 drop-shadow" /> : <Volume2 className="h-5 w-5 drop-shadow" />}
        </button>
      </div>

      {/* IN-GAME MINIMALIST DIEGETIC HUD */}
      {phase === 'playing' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-6 pt-5 sm:px-9 sm:pt-7">
            {/* Top-Left Distance, Biome & Record */}
            <div style={{ textShadow: '0 2px 14px rgba(20, 34, 41, 0.8)' }}>
              <div className="tabular-nums text-3xl font-semibold tracking-tight text-[#fff5e4] sm:text-4xl">
                {distance.toLocaleString()}
                <span className="ml-1.5 text-base font-medium text-[#ffdda1]">m</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs tracking-wide text-[#f7ead9]/90">
                <span>{biomeName}</span>
                {mode === 'daily' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#ffd166]">Daily</span>
                  </>
                )}
                {highScore > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    {isNewRecord ? (
                      <span className="font-semibold text-[#ffd166]">New Record</span>
                    ) : (
                      <span className="tabular-nums">Best {highScore.toLocaleString()} m</span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Top-Right Naira Banknote Counter */}
            <div
              className="mr-24 flex items-center gap-2.5 pt-1 sm:mr-28"
              style={{ textShadow: '0 2px 14px rgba(20, 34, 41, 0.8)' }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 28 20"
                className="h-5 w-7 shrink-0 drop-shadow-[0_2px_6px_rgba(20,34,41,0.75)]"
              >
                <rect x="1" y="1" width="26" height="18" rx="3" fill="#256d49" stroke="#6ee7b7" strokeWidth="1.6" />
                <rect x="4" y="4" width="20" height="12" rx="1.5" fill="none" stroke="#d8f3dc" strokeWidth="0.9" strokeOpacity="0.65" />
                <text
                  x="14"
                  y="13.5"
                  textAnchor="middle"
                  fill="#ffd166"
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="sans-serif"
                >
                  ₦
                </text>
              </svg>
              <span className="tabular-nums text-2xl font-semibold text-[#6ee7b7] sm:text-3xl">
                {formatNaira(coins)}
              </span>
            </div>
          </div>

          {/* Active Power-Up & Chaser Cues (Bottom-Left unboxed typography) */}
          <div
            className="pointer-events-none absolute bottom-6 left-6 z-20 flex flex-col gap-1.5 sm:bottom-8 sm:left-9"
            style={{ textShadow: '0 2px 12px rgba(16, 26, 31, 0.85)' }}
          >
            {dashRemaining > 0 && (
              <div className="flex items-center gap-2 tabular-nums text-sm font-semibold text-[#ffd166]">
                <Zap className="h-4 w-4" />
                <span>Sunburst Dash · {dashRemaining.toFixed(1)}s</span>
              </div>
            )}
            {magnetRemaining > 0 && (
              <div className="flex items-center gap-2 tabular-nums text-sm font-semibold text-[#6ee7b7]">
                <Magnet className="h-4 w-4" />
                <span>Jade Magnet · {magnetRemaining.toFixed(1)}s</span>
              </div>
            )}
            {hasShield && (
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f4a261]">
                <Shield className="h-4 w-4" />
                <span>Amber Aegis Active</span>
              </div>
            )}
            {chaserActive && (
              <div className="text-xs font-semibold tracking-wider text-[#ff9b85] uppercase">
                Stumbled · Hounds Closing In
              </div>
            )}
          </div>

          {/* 90-Degree Junction Turn Cue */}
          {pendingTurn && (
            <div
              className="pointer-events-none absolute top-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 font-display text-lg font-semibold tracking-[0.18em] text-[#ffd166] uppercase sm:top-28 sm:text-xl"
              style={{ textShadow: '0 2px 16px rgba(15, 25, 30, 0.9)' }}
            >
              {(pendingTurn === 'left' || pendingTurn === 'tee') && (
                <ArrowLeft className="h-5 w-5" />
              )}
              <span>
                {pendingTurn === 'left'
                  ? 'Turn Left'
                  : pendingTurn === 'right'
                    ? 'Turn Right'
                    : 'Choose Turn'}
              </span>
              {(pendingTurn === 'right' || pendingTurn === 'tee') && (
                <ArrowRight className="h-5 w-5" />
              )}
            </div>
          )}

          {/* Near-Miss "Close Call" Bonus Callout */}
          {activeNearMissId > 0 && nearMissLabel && (
            <div
              key={activeNearMissId}
              className="animate-close-call pointer-events-none absolute top-36 right-6 z-20 font-display text-base font-semibold tracking-[0.14em] text-[#ffd166] uppercase sm:right-9 sm:text-lg"
              style={{ textShadow: '0 2px 14px rgba(16, 26, 31, 0.9)' }}
            >
              {nearMissLabel}
            </div>
          )}
        </>
      )}

      {/* TITLE STATE */}
      {phase === 'title' && (
        <div
          onClick={handleStartOrRestart}
          className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-between px-6 py-10 sm:py-14"
        >
          <div className="mt-3 flex flex-col items-center text-center sm:mt-5">
            <h1
              className="font-display text-balance text-5xl font-semibold tracking-[0.14em] text-[#fff6e5] sm:text-7xl"
              style={{
                textShadow: '0 4px 28px rgba(23, 41, 49, 0.72), 0 1px 3px rgba(23, 41, 49, 0.85)',
              }}
            >
              OPSSY RUNS
            </h1>

            {/* Mode Switcher: Endless Expedition vs Daily Temple Seed */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-5 flex items-center gap-1 rounded-lg border border-[#fff5e4]/20 bg-[#1a2b32]/65 p-1"
            >
              <button
                type="button"
                onClick={() => handleModeChange('endless')}
                className={`flex min-h-[38px] items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
                  selectedMode === 'endless'
                    ? 'bg-[#ffd166] text-[#182930]'
                    : 'text-[#f5e6d3] hover:text-white'
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                Endless Expedition
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('daily')}
                className={`flex min-h-[38px] items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
                  selectedMode === 'daily'
                    ? 'bg-[#ffd166] text-[#182930]'
                    : 'text-[#f5e6d3] hover:text-white'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Daily Temple
              </button>
            </div>

            <div
              className="mt-3 flex flex-wrap items-center justify-center gap-2 tabular-nums text-xs font-medium tracking-[0.14em] text-[#ffd166] uppercase sm:text-sm"
              style={{ textShadow: '0 2px 12px rgba(20, 34, 41, 0.85)' }}
            >
              <span>
                {selectedMode === 'daily'
                  ? `Seed ${dailySeedDate} · Best ${profile.highScoreDaily.toLocaleString()} m`
                  : `Best Run · ${profile.highScoreEndless.toLocaleString()} m`}
              </span>
              {profile.lastRun && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#f5e6d3]">
                    Last Run · {profile.lastRun.distance.toLocaleString()} m
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="text-[#6ee7b7]">Wallet · {formatNaira(profile.totalCoins)}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#fff5e4]">
                Runner ·{' '}
                {CHARACTERS.find((c) => c.id === profile.equippedCharacter)?.name ??
                  'Sandstone Explorer'}
              </span>
            </div>
          </div>

          <div className="mb-2 flex flex-col items-center gap-4 text-center sm:mb-4">
            {isSavedRunResumable(savedRun) ? (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex flex-col items-center gap-2.5"
              >
                <button
                  type="button"
                  onClick={handleResumeSavedRun}
                  className="flex min-h-[46px] items-center gap-2.5 rounded-lg bg-[#ffd166] px-6 py-2.5 text-sm font-semibold tracking-[0.12em] text-[#182930] uppercase shadow-xl transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-white active:scale-95 whitespace-nowrap"
                >
                  <Play className="h-4 w-4" />
                  Resume {savedRun.mode === 'daily' ? 'Daily ' : ''}Run ·{' '}
                  {savedRun.distance.toLocaleString()} m · {formatNaira(savedRun.coins)}
                </button>
                <p
                  className="animate-prompt-breathe font-display text-sm font-medium tracking-[0.14em] text-[#fff6e5]/90 sm:text-base"
                  style={{ textShadow: '0 2px 16px rgba(20, 34, 41, 0.85)' }}
                >
                  or Press Space / Tap Elsewhere to Start Fresh
                </p>
              </div>
            ) : (
              <p
                className="animate-prompt-breathe font-display text-lg font-medium tracking-[0.16em] text-[#fff6e5] sm:text-xl"
                style={{ textShadow: '0 2px 16px rgba(20, 34, 41, 0.85)' }}
              >
                Press Space or Tap to Run
              </p>
            )}

            <div
              onClick={(e) => e.stopPropagation()}
              className="flex flex-wrap items-center justify-center gap-3"
            >
              <button
                type="button"
                onClick={() => {
                  setVaultTab('characters');
                  setVaultOpen(true);
                }}
                className="flex min-h-[42px] items-center gap-2 rounded-lg border border-[#6ee7b7]/45 bg-[#1a2b32]/80 px-5 py-2 text-xs font-semibold tracking-[0.14em] text-[#6ee7b7] uppercase transition-colors hover:bg-[#264653] focus-visible:outline-2 focus-visible:outline-[#ffd166] whitespace-nowrap"
              >
                <Users className="h-3.5 w-3.5" />
                Characters
              </button>
              <button
                type="button"
                onClick={() => {
                  setVaultTab('relics');
                  setVaultOpen(true);
                }}
                className="flex min-h-[42px] items-center gap-2 rounded-lg border border-[#ffdda1]/35 bg-[#1a2b32]/75 px-5 py-2 text-xs font-semibold tracking-[0.14em] text-[#ffd166] uppercase transition-colors hover:bg-[#264653] focus-visible:outline-2 focus-visible:outline-[#ffd166] whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Relics & Outfits
              </button>
              <PWAInstallButton />
            </div>

            <p
              className="text-xs tracking-wider text-[#f5e6d3]/85"
              style={{ textShadow: '0 1px 10px rgba(20, 34, 41, 0.85)' }}
            >
              A / D or Arrows to Steer & Turn Corners · W / Space to Jump · S / Down to Slide & Dive
            </p>
          </div>
        </div>
      )}

      {/* PAUSED OVERLAY */}
      {phase === 'paused' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#192b33]/58 px-6 text-center text-[#fff5e4]">
          <h2
            className="font-display text-4xl font-semibold tracking-[0.16em] sm:text-5xl"
            style={{ textShadow: '0 3px 18px rgba(15, 25, 30, 0.75)' }}
          >
            PAUSED
          </h2>
          <p className="mt-3 tabular-nums text-sm tracking-wide text-[#ffdda1]">
            {distance.toLocaleString()} m · {formatNaira(coins)} · {biomeName}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleTogglePause}
              className="flex min-h-[44px] items-center gap-2 rounded-lg bg-[#ffd166] px-6 py-2.5 text-sm font-semibold tracking-wide text-[#1b323b] shadow-lg transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-white active:scale-95 whitespace-nowrap"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
            <button
              type="button"
              onClick={handleStartOrRestart}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#fff5e4]/35 bg-[#1b323b]/70 px-5 py-2.5 text-sm font-medium tracking-wide text-[#fff5e4] transition-colors duration-150 hover:bg-[#1b323b]/90 focus-visible:outline-2 focus-visible:outline-[#ffd166] active:scale-95 whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" />
              Restart
            </button>
            <button
              type="button"
              onClick={handleReturnToTitle}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#fff5e4]/25 bg-[#1b323b]/65 px-5 py-2.5 text-sm font-medium tracking-wide text-[#f5e6d3] transition-colors duration-150 hover:bg-[#1b323b]/90 focus-visible:outline-2 focus-visible:outline-[#ffd166] active:scale-95 whitespace-nowrap"
            >
              Save & Gate
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {phase === 'gameover' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#182930]/64 px-6 text-center text-[#fff5e4]">
          {isNewRecord && (
            <p
              className="mb-2 font-display text-sm font-semibold tracking-[0.26em] text-[#ffd166] uppercase"
              style={{ textShadow: '0 2px 12px rgba(15, 25, 30, 0.8)' }}
            >
              {mode === 'daily' ? 'New Daily Record' : 'New Record'}
            </p>
          )}

          <h2
            className="font-display text-4xl font-semibold tracking-[0.14em] text-[#fff6e5] sm:text-5xl"
            style={{ textShadow: '0 4px 22px rgba(15, 25, 30, 0.8)' }}
          >
            RUN ENDED
          </h2>

          <p className="mt-2 text-xs tracking-[0.14em] text-[#e6ccb2]/85 uppercase">
            {mode === 'daily' ? `Daily Temple · ${dailySeedDate}` : `Endless Expedition · ${biomeName}`}
          </p>

          <div
            className="mt-6 flex items-baseline gap-8 border-y border-[#fff5e4]/20 px-6 py-5 sm:gap-14"
            style={{ textShadow: '0 2px 12px rgba(15, 25, 30, 0.75)' }}
          >
            <div>
              <div className="text-xs tracking-[0.16em] text-[#e6ccb2]/85 uppercase">Distance</div>
              <div className="mt-1 tabular-nums text-3xl font-semibold text-[#fff6e5] sm:text-4xl">
                {distance.toLocaleString()}
                <span className="ml-1 text-base font-medium text-[#ffdda1]">m</span>
              </div>
            </div>

            <div>
              <div className="text-xs tracking-[0.16em] text-[#e6ccb2]/85 uppercase">Naira</div>
              <div className="mt-1 tabular-nums text-3xl font-semibold text-[#6ee7b7] sm:text-4xl">
                {formatNaira(coins)}
              </div>
            </div>

            <div>
              <div className="text-xs tracking-[0.16em] text-[#e6ccb2]/85 uppercase">Best</div>
              <div className="mt-1 tabular-nums text-3xl font-semibold text-[#f7ead9] sm:text-4xl">
                {highScore.toLocaleString()}
                <span className="ml-1 text-base font-medium text-[#ffdda1]">m</span>
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3.5">
            <button
              type="button"
              onClick={handleStartOrRestart}
              className="flex min-h-[46px] items-center gap-2.5 rounded-lg bg-[#ffd166] px-7 py-3 text-sm font-semibold tracking-[0.12em] text-[#1b323b] uppercase shadow-xl transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-white active:scale-95 whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" />
              Run Again
            </button>

            <button
              type="button"
              onClick={() => {
                setVaultTab('characters');
                setVaultOpen(true);
              }}
              className="flex min-h-[46px] items-center gap-2 rounded-lg border border-[#ffdda1]/35 bg-[#1a2b32]/80 px-5 py-3 text-xs font-semibold tracking-[0.12em] text-[#6ee7b7] uppercase transition-colors hover:bg-[#264653] focus-visible:outline-2 focus-visible:outline-[#ffd166] whitespace-nowrap"
            >
              <Banknote className="h-4 w-4" />
              Vault ({formatNaira(profile.totalCoins)})
            </button>

            <button
              type="button"
              onClick={handleReturnToTitle}
              className="flex min-h-[46px] items-center gap-2 rounded-lg border border-[#fff5e4]/25 bg-[#1b323b]/65 px-5 py-3 text-xs font-medium tracking-[0.12em] text-[#f5e6d3] uppercase transition-colors hover:bg-[#1b323b]/90 focus-visible:outline-2 focus-visible:outline-[#ffd166] whitespace-nowrap"
            >
              Temple Gate
            </button>
          </div>

          <p className="mt-3 text-xs tracking-wider text-[#e6ccb2]/80">
            Press Space or Enter to run again
          </p>
        </div>
      )}

      {/* TEMPLE VAULT OVERLAY (Characters, Relic Upgrades, Outfits & Trails) */}
      {vaultOpen && (
        <RelicVaultOverlay
          profile={profile}
          initialTab={vaultTab}
          onSelectCharacter={handleSelectCharacter}
          onUpgrade={handleUpgrade}
          onSelectOutfit={handleSelectOutfit}
          onSelectTrail={handleSelectTrail}
          onClose={() => setVaultOpen(false)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
