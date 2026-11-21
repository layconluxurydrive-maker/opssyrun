import { useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void install();
        }}
        className="flex min-h-[42px] items-center gap-2 rounded-lg border border-[#ffd166]/45 bg-[#1a2b32]/85 px-5 py-2 text-xs font-semibold tracking-[0.14em] text-[#ffd166] uppercase transition-colors hover:bg-[#264653] focus-visible:outline-2 focus-visible:outline-[#ffd166] whitespace-nowrap"
      >
        <Download className="h-3.5 w-3.5" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowIOSGuide(true);
          }}
          className="flex min-h-[42px] items-center gap-2 rounded-lg border border-[#ffd166]/45 bg-[#1a2b32]/85 px-5 py-2 text-xs font-semibold tracking-[0.14em] text-[#ffd166] uppercase transition-colors hover:bg-[#264653] focus-visible:outline-2 focus-visible:outline-[#ffd166] whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" />
          Install App
        </button>

        {showIOSGuide && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#142329]/82 px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Install OPSSY RUNS on iPhone or iPad"
          >
            <div className="w-full max-w-sm rounded-2xl border border-[#ffdda1]/25 bg-[#182930] p-6 text-left text-[#fff4e2] shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-base font-semibold tracking-[0.12em] text-[#ffd166] uppercase">
                  Install OPSSY RUNS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ffdda1]/18 text-[#f5e6d3] hover:bg-[#264653]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-[#f5e6d3]">
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-[#ffd166]">1.</span>
                  <span>
                    Tap the <Share className="mx-1 inline h-4 w-4 text-[#ffd166]" />{' '}
                    <strong>Share</strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-[#ffd166]">2.</span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-[#ffd166] py-2.5 text-xs font-semibold tracking-[0.12em] text-[#182930] uppercase hover:bg-[#ffdf8e]"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-lg border border-[#ffd166]/35 bg-[#182930]/92 px-3.5 py-2 text-xs font-medium tracking-wide text-[#ffd166] shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Offline Mode — Playing Cached App</span>
    </div>
  );
}
