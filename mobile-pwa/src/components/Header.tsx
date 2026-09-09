import React from 'react';
import {
  BookOpen,
  ArrowLeft,
  Bookmark as BookmarkIcon,
  Settings,
  Wifi,
  WifiOff,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import type { ReaderSettings } from '../types';

interface HeaderProps {
  isReading: boolean;
  bookTitle?: string;
  isOfflineReady: boolean;
  isOnline: boolean;
  updateAvailable: boolean;
  settings: ReaderSettings;
  onBackToLibrary?: () => void;
  onOpenBookmarks?: () => void;
  onOpenSettings: () => void;
  onApplyUpdate?: () => void;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isReading,
  bookTitle,
  isOfflineReady,
  isOnline,
  updateAvailable,
  settings,
  onBackToLibrary,
  onOpenBookmarks,
  onOpenSettings,
  onApplyUpdate,
  onToggleTheme,
}) => {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'calc(var(--safe-top) + 8px) 12px 8px 12px',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        minHeight: 'var(--header-height)',
        zIndex: 40,
        position: 'relative',
      }}
    >
      {/* Left section: Back button or App Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {isReading ? (
          <button
            className="icon-btn"
            onClick={onBackToLibrary}
            aria-label="Back to Library"
            style={{ flexShrink: 0 }}
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <BookOpen size={22} color="var(--accent-gold)" />
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--accent-gold)',
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.5px',
                margin: 0,
              }}
            >
              ✦ Book Reader
            </h1>
          </div>
        )}

        {/* In reading mode: Book title */}
        {isReading && bookTitle && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                margin: 0,
              }}
            >
              {bookTitle}
            </h2>
          </div>
        )}
      </div>

      {/* Center: Update banner if available */}
      {updateAvailable && onApplyUpdate && (
        <button
          className="primary-btn"
          onClick={onApplyUpdate}
          style={{
            height: 32,
            padding: '0 10px',
            fontSize: 11,
            marginRight: 6,
            borderRadius: 8,
          }}
        >
          <RefreshCw size={13} className="spin-slow" />
          <span>Update Ready</span>
        </button>
      )}

      {/* Right section: Badges & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* Offline Ready Badge (in library) */}
        {!isReading && (
          <div
            className={`badge ${isOfflineReady ? 'badge-green' : 'badge-gold'}`}
            title={
              isOfflineReady
                ? 'All reader resources are cached for offline use.'
                : 'Caching reader resources...'
            }
            style={{ marginRight: 4 }}
          >
            {isOfflineReady ? (
              <>
                <WifiOff size={11} />
                <span>Offline Ready</span>
              </>
            ) : (
              <>
                <Wifi size={11} />
                <span>Online</span>
              </>
            )}
          </div>
        )}

        {/* Quick theme toggle */}
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title="Toggle Light/Dark Theme"
        >
          {settings.theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>

        {/* Bookmarks button in reading mode */}
        {isReading && onOpenBookmarks && (
          <button
            className="icon-btn"
            onClick={onOpenBookmarks}
            aria-label="Bookmarks"
            title="Bookmarks"
          >
            <BookmarkIcon size={20} color="var(--accent-gold)" />
          </button>
        )}

        {/* Settings button */}
        <button
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
};
