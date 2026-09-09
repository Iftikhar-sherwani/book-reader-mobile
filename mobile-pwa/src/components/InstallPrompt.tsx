import React, { useState } from 'react';
import { Download, Smartphone, X, Check, HelpCircle } from 'lucide-react';

interface InstallPromptProps {
  deferredPrompt: any;
  isStandalone: boolean;
  onInstalled: () => void;
}

export const InstallPrompt: React.FC<InstallPromptProps> = ({
  deferredPrompt,
  isStandalone,
  onInstalled,
}) => {
  const [showInstructions, setShowInstructions] = useState(false);

  // If already running as installed PWA standalone app, don't show prompt
  if (isStandalone) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        onInstalled();
      }
    } else {
      setShowInstructions(true);
    }
  };

  return (
    <>
      <button
        className="secondary-btn"
        onClick={handleInstallClick}
        aria-label="Install App"
        style={{
          height: 38,
          padding: '0 12px',
          fontSize: 13,
          borderColor: 'var(--border-highlight)',
          color: 'var(--accent-gold)',
          backgroundColor: 'rgba(212, 175, 85, 0.08)',
        }}
      >
        <Download size={16} />
        <span>Install App</span>
      </button>

      {showInstructions && (
        <div className="modal-overlay" onClick={() => setShowInstructions(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Smartphone size={22} color="var(--accent-gold)" />
                <h3 style={{ fontSize: 18, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                  Install on Android
                </h3>
              </div>
              <button className="icon-btn" onClick={() => setShowInstructions(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <p style={{ color: 'var(--text-primary)', marginBottom: 16, lineHeight: 1.5 }}>
              Install Book Reader to read books offline with full-screen distraction-free immersion:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ 
                  background: 'var(--accent-gold)', 
                  color: '#141210', 
                  width: 24, 
                  height: 24, 
                  borderRadius: '50%', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700, 
                  fontSize: 12,
                  flexShrink: 0 
                }}>1</span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Open in Chrome on Android</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Make sure you are browsing via HTTPS (e.g. your GitHub Pages URL).</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ 
                  background: 'var(--accent-gold)', 
                  color: '#141210', 
                  width: 24, 
                  height: 24, 
                  borderRadius: '50%', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700, 
                  fontSize: 12,
                  flexShrink: 0 
                }}>2</span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Tap the Chrome Menu</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Tap the three dots <strong>(⋮)</strong> in the top-right corner of Chrome.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ 
                  background: 'var(--accent-gold)', 
                  color: '#141210', 
                  width: 24, 
                  height: 24, 
                  borderRadius: '50%', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700, 
                  fontSize: 12,
                  flexShrink: 0 
                }}>3</span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Tap &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>An icon will appear on your phone&apos;s home screen and app drawer.</p>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-elevated)', padding: 12, borderRadius: 10, marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <HelpCircle size={15} />
                <span>Local development Note: Chrome only enables automated PWA installation prompts over HTTPS or localhost.</span>
              </p>
            </div>

            <button
              className="primary-btn"
              onClick={() => setShowInstructions(false)}
              style={{ width: '100%' }}
            >
              <Check size={18} />
              <span>Got it</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
