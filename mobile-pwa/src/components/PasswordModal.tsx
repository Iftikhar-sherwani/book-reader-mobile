import React, { useState } from 'react';
import { Lock, X, KeyRound } from 'lucide-react';

interface PasswordModalProps {
  onSubmit: (password: string) => void;
  onCancel: () => void;
  error?: string | null;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({ onSubmit, onCancel, error }) => {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    onSubmit(password);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-center" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={20} color="var(--accent-gold)" />
            <h3 style={{ fontSize: 18, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
              Password Required
            </h3>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancel">
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 16, lineHeight: 1.5 }}>
          This PDF document is encrypted. Please enter the password to open it.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <input
              type="password"
              placeholder="Enter document password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                height: 48,
                padding: '0 14px',
                fontSize: 15,
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: error ? '1px solid var(--danger)' : '1px solid var(--border-subtle)',
                borderRadius: 10,
                outline: 'none',
              }}
            />
            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 6 }}>
                {error}
              </p>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              For your security, passwords are never stored on device.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="secondary-btn" onClick={onCancel} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" style={{ flex: 1 }}>
              <KeyRound size={17} />
              <span>Unlock</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
