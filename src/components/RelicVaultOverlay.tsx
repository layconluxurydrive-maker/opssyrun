import { useState } from 'react';
import { Banknote, Check, Magnet, Shield, Sparkles, X, Zap } from 'lucide-react';
import {
  CHARACTERS,
  formatNaira,
  OUTFITS,
  TRAILS,
  type CharacterId,
  type OutfitId,
  type PlayerProfile,
  type TrailId,
} from '../game/palette';
import { UPGRADE_META, type UpgradeKey } from '../game/profile';

export type VaultTab = 'characters' | 'relics' | 'wardrobe';

interface RelicVaultOverlayProps {
  profile: PlayerProfile;
  initialTab?: VaultTab;
  onSelectCharacter: (id: CharacterId) => void;
  onUpgrade: (key: UpgradeKey) => void;
  onSelectOutfit: (id: OutfitId) => void;
  onSelectTrail: (id: TrailId) => void;
  onClose: () => void;
}

const UPGRADE_ICONS: Record<UpgradeKey, typeof Magnet> = {
  magnetLevel: Magnet,
  shieldLevel: Shield,
  dashLevel: Zap,
  headStartLevel: Sparkles,
};

export function RelicVaultOverlay({
  profile,
  initialTab = 'characters',
  onSelectCharacter,
  onUpgrade,
  onSelectOutfit,
  onSelectTrail,
  onClose,
}: RelicVaultOverlayProps) {
  const [tab, setTab] = useState<VaultTab>(initialTab);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#142329]/82 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Temple Vault: Characters, Relics, and Attire"
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[49px] border border-[#ffdda1]/20 bg-[#000000] text-[#fff4e2] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 rounded-[49px] border border-[#ffdda1]/14 px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[0.14em] text-[#fff6e5] sm:text-2xl">
              TEMPLE VAULT
            </h2>
            <p className="mt-0.5 text-xs tracking-wide text-[#e6ccb2]/80">
              Unlock runners, upgrade relics, and customize stride attire with Naira
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 tabular-nums text-base font-semibold text-[#6ee7b7]">
              <Banknote className="h-4 w-4 text-[#439c6c]" />
              <span>{formatNaira(profile.totalCoins)}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close vault"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#ffdda1]/18 text-[#f5e6d3] transition-colors hover:bg-[#264653] focus-visible:outline-2 focus-visible:outline-[#ffd166]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Segmented Tab Switch */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ffdda1]/12 px-6 py-3">
          <button
            type="button"
            onClick={() => setTab('characters')}
            className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
              tab === 'characters'
                ? 'bg-[#ffd166] text-[#182930]'
                : 'text-[#e6ccb2] hover:bg-[#264653]/60'
            }`}
          >
            Characters
          </button>
          <button
            type="button"
            onClick={() => setTab('relics')}
            className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
              tab === 'relics'
                ? 'bg-[#ffd166] text-[#182930]'
                : 'text-[#e6ccb2] hover:bg-[#264653]/60'
            }`}
          >
            Relic Upgrades
          </button>
          <button
            type="button"
            onClick={() => setTab('wardrobe')}
            className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
              tab === 'wardrobe'
                ? 'bg-[#ffd166] text-[#182930]'
                : 'text-[#e6ccb2] hover:bg-[#264653]/60'
            }`}
          >
            Outfits & Trails
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'characters' ? (
            <div className="divide-y divide-[#ffdda1]/12">
              {CHARACTERS.map((char) => {
                const unlocked = profile.unlockedCharacters.includes(char.id);
                const equipped = profile.equippedCharacter === char.id;
                const canAfford = !unlocked && profile.totalCoins >= char.cost;

                return (
                  <div
                    key={char.id}
                    className="flex flex-col justify-between gap-4 py-4 first:pt-1 last:pb-1 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-center gap-4">
                      {char.imageUrl ? (
                        <img
                          src={char.imageUrl}
                          alt={char.name}
                          referrerPolicy="no-referrer"
                          className="h-20 w-16 shrink-0 rounded-xl border border-[#ffdda1]/25 object-cover object-top shadow-md"
                        />
                      ) : (
                        <div
                          className="flex h-20 w-16 shrink-0 items-center justify-center rounded-xl border border-[#ffdda1]/25 shadow-md"
                          style={{
                            background: 'linear-gradient(160deg, #5a412d 0%, #d4a373 60%, #264653 100%)',
                          }}
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 40 40" className="h-9 w-9 text-[#fff5e4]">
                            <ellipse cx="20" cy="14" rx="14" ry="4" fill="currentColor" opacity="0.9" />
                            <path d="M12 13 C12 7, 28 7, 28 13 Z" fill="currentColor" />
                            <circle cx="20" cy="21" r="5" fill="#ffd166" />
                            <path d="M11 35 C12 27, 28 27, 29 35 Z" fill="#c24936" />
                          </svg>
                        </div>
                      )}

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold tracking-wide text-[#fff5e4]">
                            {char.name}
                          </h3>
                          <span className="text-xs font-medium text-[#ffdda1]/75">
                            · {char.subtitle}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[#e6ccb2]/80">
                          {char.description}
                        </p>
                        <div className="mt-1.5 tabular-nums text-xs font-semibold text-[#6ee7b7]">
                          {char.cost === 0 ? 'Starter Runner' : `Price · ${formatNaira(char.cost)}`}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={equipped || (!unlocked && !canAfford)}
                      onClick={() => onSelectCharacter(char.id)}
                      className={`flex min-h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
                        equipped
                          ? 'border border-[#ffd166]/55 text-[#ffd166] cursor-default'
                          : unlocked
                            ? 'bg-[#2a4d59] text-[#fff5e4] hover:bg-[#355f6d]'
                            : canAfford
                              ? 'bg-[#ffd166] text-[#182930] hover:bg-[#ffdf8e]'
                              : 'border border-[#ffdda1]/15 text-[#e6ccb2]/50 cursor-not-allowed'
                      }`}
                    >
                      {equipped ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Chosen
                        </>
                      ) : unlocked ? (
                        'Choose'
                      ) : (
                        `Buy · ${formatNaira(char.cost)}`
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : tab === 'relics' ? (
            <div className="divide-y divide-[#ffdda1]/12">
              {(Object.keys(UPGRADE_META) as UpgradeKey[]).map((key) => {
                const meta = UPGRADE_META[key];
                const level = profile.upgrades[key];
                const maxed = level >= meta.maxLevel;
                const nextCost = maxed ? 0 : meta.costs[level];
                const canAfford = !maxed && profile.totalCoins >= nextCost;
                const Icon = UPGRADE_ICONS[key];

                return (
                  <div
                    key={key}
                    className="flex flex-col justify-between gap-4 py-4 first:pt-1 last:pb-1 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#ffdda1]/20 bg-[#223942] text-[#ffd166]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-sm font-semibold tracking-wide text-[#fff5e4]">
                            {meta.name}
                          </h3>
                          <span className="tabular-nums text-xs text-[#ffdda1]/80">
                            Lv {level}/{meta.maxLevel} · {meta.effectLabel(level)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[#e6ccb2]/80">
                          {meta.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={maxed || !canAfford}
                      onClick={() => onUpgrade(key)}
                      className={`min-h-[42px] shrink-0 rounded-lg px-4 py-2 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
                        maxed
                          ? 'border border-[#ffdda1]/15 text-[#e6ccb2]/60 cursor-default'
                          : canAfford
                            ? 'bg-[#ffd166] text-[#182930] hover:bg-[#ffdf8e]'
                            : 'border border-[#ffdda1]/15 bg-[#223942]/60 text-[#e6ccb2]/50 cursor-not-allowed'
                      }`}
                    >
                      {maxed ? 'Mastered' : `Upgrade · ${formatNaira(nextCost)}`}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Explorer Outfits */}
              <div>
                <h3 className="font-display text-xs font-semibold tracking-[0.18em] text-[#ffdda1] uppercase">
                  Explorer Attire
                </h3>
                <div className="mt-2 divide-y divide-[#ffdda1]/12">
                  {OUTFITS.map((outfit) => {
                    const unlocked = profile.unlockedOutfits.includes(outfit.id);
                    const equipped = profile.equippedOutfit === outfit.id;
                    const canAfford = !unlocked && profile.totalCoins >= outfit.cost;

                    return (
                      <div
                        key={outfit.id}
                        className="flex items-center justify-between gap-4 py-3.5"
                      >
                        <div className="flex items-center gap-3.5">
                          <span
                            className="h-7 w-7 shrink-0 rounded-full border border-[#fff4e2]/30"
                            style={{ backgroundColor: outfit.swatchHex }}
                            aria-hidden="true"
                          />
                          <div>
                            <div className="text-sm font-semibold text-[#fff5e4]">
                              {outfit.name}
                            </div>
                            <div className="text-xs text-[#e6ccb2]/80">{outfit.description}</div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={equipped || (!unlocked && !canAfford)}
                          onClick={() => onSelectOutfit(outfit.id)}
                          className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
                            equipped
                              ? 'border border-[#ffd166]/50 text-[#ffd166] cursor-default'
                              : unlocked
                                ? 'bg-[#2a4d59] text-[#fff5e4] hover:bg-[#355f6d]'
                                : canAfford
                                  ? 'bg-[#ffd166] text-[#182930] hover:bg-[#ffdf8e]'
                                  : 'border border-[#ffdda1]/15 text-[#e6ccb2]/50 cursor-not-allowed'
                          }`}
                        >
                          {equipped ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Equipped
                            </>
                          ) : unlocked ? (
                            'Equip'
                          ) : (
                            `Unlock · ${formatNaira(outfit.cost)}`
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footstep Trail Effects */}
              <div className="border-t border-[#ffdda1]/15 pt-5">
                <h3 className="font-display text-xs font-semibold tracking-[0.18em] text-[#ffdda1] uppercase">
                  Stride Trails
                </h3>
                <div className="mt-2 divide-y divide-[#ffdda1]/12">
                  {TRAILS.map((trail) => {
                    const unlocked = profile.unlockedTrails.includes(trail.id);
                    const equipped = profile.equippedTrail === trail.id;
                    const canAfford = !unlocked && profile.totalCoins >= trail.cost;

                    return (
                      <div
                        key={trail.id}
                        className="flex items-center justify-between gap-4 py-3.5"
                      >
                        <div className="flex items-center gap-3.5">
                          <span
                            className="h-7 w-7 shrink-0 rounded-full border border-[#fff4e2]/30"
                            style={{ backgroundColor: trail.swatchHex }}
                            aria-hidden="true"
                          />
                          <div>
                            <div className="text-sm font-semibold text-[#fff5e4]">
                              {trail.name}
                            </div>
                            <div className="text-xs text-[#e6ccb2]/80">{trail.description}</div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={equipped || (!unlocked && !canAfford)}
                          onClick={() => onSelectTrail(trail.id)}
                          className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap ${
                            equipped
                              ? 'border border-[#ffd166]/50 text-[#ffd166] cursor-default'
                              : unlocked
                                ? 'bg-[#2a4d59] text-[#fff5e4] hover:bg-[#355f6d]'
                                : canAfford
                                  ? 'bg-[#ffd166] text-[#182930] hover:bg-[#ffdf8e]'
                                  : 'border border-[#ffdda1]/15 text-[#e6ccb2]/50 cursor-not-allowed'
                          }`}
                        >
                          {equipped ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Equipped
                            </>
                          ) : unlocked ? (
                            'Equip'
                          ) : (
                            `Unlock · ${formatNaira(trail.cost)}`
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
