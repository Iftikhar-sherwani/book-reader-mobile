import React, { useState, useEffect, useRef } from 'react';
import type { ReaderSettings, StorageStats } from '../types';
import { checkStorageStats, requestPersistentStorage, formatBytes } from '../services/storageService';
import { generateBackup, downloadBackupFile, restoreBackup } from '../services/backupService';
import { getUnmatchedBackupsCount } from '../services/db';
import {
  X,
  HardDrive,
  ShieldCheck,
  Download,
  Upload,
  Moon,
  Sun,
  BookOpen,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface SettingsModalProps {
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  onClose: () => void;
  onDataRestored?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose,
  onDataRestored,
}) => {
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [unmatchedCount, setUnmatchedCount] = useState<number>(0);
  const [restoreMessage, setRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const stats = await checkStorageStats();
    setStorageStats(stats);
    const unmatched = await getUnmatchedBackupsCount();
    setUnmatchedCount(unmatched);
  };

  const handleRequestPersistent = async () => {
    const granted = await requestPersistentStorage();
    if (granted) {
      await loadStats();
    } else {
      alert('Persistent storage was not granted by your browser. Your books and progress remain stored locally in IndexedDB.');
    }
  };

  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      const json = await generateBackup();
      downloadBackupFile(json);
    } catch (err: any) {
      alert('Failed to generate backup: ' + (err?.message || err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await restoreBackup(text);
      setRestoreMessage({
        type: 'success',
        text: `Restored progress for ${result.restoredMatched} existing book(s)${
          result.unmatchedPreserved > 0
            ? ` and safely queued ${result.unmatchedPreserved} record(s) for books you import later.`
            : '.'
        }`,
      });
      await loadStats();
      if (onDataRestored) onDataRestored();
    } catch (err: any) {
      setRestoreMessage({
        type: 'error',
        text: err?.message || 'Failed to restore backup file.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90dvh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
            ✦ Settings & Storage
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        {/* Theme Settings */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            APPEARANCE & THEME
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <button
              className={`secondary-btn ${settings.theme === 'dark' ? 'active-theme' : ''}`}
              onClick={() => onUpdateSettings({ theme: 'dark' })}
              style={{
                borderColor: settings.theme === 'dark' ? 'var(--accent-gold)' : 'var(--border-subtle)',
                backgroundColor: settings.theme === 'dark' ? 'rgba(212, 175, 85, 0.15)' : 'var(--bg-elevated)',
                flexDirection: 'column',
                height: 60,
                padding: '8px 4px',
              }}
            >
              <Moon size={18} color="var(--accent-gold)" />
              <span style={{ fontSize: 12, marginTop: 4 }}>Dark</span>
            </button>

            <button
              className={`secondary-btn ${settings.theme === 'sepia' ? 'active-theme' : ''}`}
              onClick={() => onUpdateSettings({ theme: 'sepia' })}
              style={{
                borderColor: settings.theme === 'sepia' ? 'var(--accent-gold)' : 'var(--border-subtle)',
                backgroundColor: settings.theme === 'sepia' ? 'rgba(212, 175, 85, 0.15)' : 'var(--bg-elevated)',
                flexDirection: 'column',
                height: 60,
                padding: '8px 4px',
              }}
            >
              <BookOpen size={18} color="var(--accent-gold)" />
              <span style={{ fontSize: 12, marginTop: 4 }}>Sepia</span>
            </button>

            <button
              className={`secondary-btn ${settings.theme === 'light' ? 'active-theme' : ''}`}
              onClick={() => onUpdateSettings({ theme: 'light' })}
              style={{
                borderColor: settings.theme === 'light' ? 'var(--accent-gold)' : 'var(--border-subtle)',
                backgroundColor: settings.theme === 'light' ? 'rgba(212, 175, 85, 0.15)' : 'var(--bg-elevated)',
                flexDirection: 'column',
                height: 60,
                padding: '8px 4px',
              }}
            >
              <Sun size={18} color="var(--accent-gold)" />
              <span style={{ fontSize: 12, marginTop: 4 }}>Light</span>
            </button>
          </div>
        </div>

        {/* Reader Preferences */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            READER PREFERENCES
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>Default PDF View</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="secondary-btn"
                  onClick={() => onUpdateSettings({ pdfFitMode: 'width' })}
                  style={{
                    height: 34,
                    padding: '0 10px',
                    fontSize: 12,
                    borderColor: settings.pdfFitMode === 'width' ? 'var(--accent-gold)' : 'var(--border-subtle)',
                  }}
                >
                  Fit Width
                </button>
                <button
                  className="secondary-btn"
                  onClick={() => onUpdateSettings({ pdfFitMode: 'page' })}
                  style={{
                    height: 34,
                    padding: '0 10px',
                    fontSize: 12,
                    borderColor: settings.pdfFitMode === 'page' ? 'var(--accent-gold)' : 'var(--border-subtle)',
                  }}
                >
                  Fit Page
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>PDF Night View Filter</span>
              <select
                value={settings.pdfPageFilter}
                onChange={(e) => onUpdateSettings({ pdfPageFilter: e.target.value as any })}
                style={{
                  height: 36,
                  borderRadius: 8,
                  padding: '0 10px',
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <option value="normal">Normal (Original colors)</option>
                <option value="warm">Warm Tint (Eye comfort)</option>
                <option value="night">Soft Dark Filter</option>
              </select>
            </div>
          </div>
        </div>

        {/* Device Storage Info */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            DEVICE STORAGE
          </label>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HardDrive size={18} color="var(--accent-gold)" />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Local Storage Usage</span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {storageStats ? formatBytes(storageStats.usageBytes) : 'Calculating...'}
                {storageStats && storageStats.quotaBytes > 0 && ` / ${formatBytes(storageStats.quotaBytes)}`}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={16} color={storageStats?.persisted ? 'var(--success)' : 'var(--text-muted)'} />
                <span style={{ fontSize: 13 }}>
                  {storageStats?.persisted ? 'Persistent Storage: Active' : 'Persistent Storage: Standard'}
                </span>
              </div>
              {!storageStats?.persisted && (
                <button
                  className="secondary-btn"
                  onClick={handleRequestPersistent}
                  style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                >
                  Request Persistent
                </button>
              )}
            </div>

            {unmatchedCount > 0 && (
              <p style={{ fontSize: 12, color: 'var(--accent-gold)', marginTop: 8 }}>
                ✦ {unmatchedCount} backup progress record(s) queued for future book imports.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, padding: '8px 10px', borderRadius: 8, backgroundColor: 'rgba(224, 108, 117, 0.08)' }}>
            <AlertTriangle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              <strong>Important:</strong> Clearing browser/site data deletes local books and reading progress. Export regular backups below to safeguard your data.
            </p>
          </div>
        </div>

        {/* Backup & Restore */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            BACKUP & RESTORE
          </label>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Backups contain your bookmarks and exact reading positions matched by book fingerprints. They do not contain the original book files.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="secondary-btn"
              onClick={handleExportBackup}
              disabled={isExporting}
              style={{ flex: 1 }}
            >
              <Download size={16} />
              <span>{isExporting ? 'Exporting...' : 'Export Backup'}</span>
            </button>

            <button
              className="secondary-btn"
              onClick={() => fileInputRef.current?.click()}
              style={{ flex: 1 }}
            >
              <Upload size={16} />
              <span>Restore Backup</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </div>

          {restoreMessage && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 12,
                padding: 10,
                borderRadius: 8,
                backgroundColor:
                  restoreMessage.type === 'success' ? 'rgba(152, 195, 121, 0.12)' : 'rgba(224, 108, 117, 0.12)',
                border: `1px solid ${restoreMessage.type === 'success' ? 'rgba(152, 195, 121, 0.3)' : 'rgba(224, 108, 117, 0.3)'}`,
              }}
            >
              {restoreMessage.type === 'success' ? (
                <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />
              ) : (
                <AlertTriangle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
              )}
              <p
                style={{
                  fontSize: 12,
                  color: restoreMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {restoreMessage.text}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
