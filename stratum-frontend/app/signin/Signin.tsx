import React, { useState } from 'react';
import { ArrowRight, X, Eye, EyeOff } from 'lucide-react';
import { ACCESS_TOKEN_KEY } from '@/lib/api';

interface SignUpProps {
  isOpen: boolean;
  onClose: () => void;
}

type Mode = 'login' | 'register';

const RAW_API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_BASE = RAW_API_BASE.replace(/\/api\/?$/, '');

const SignUp: React.FC<SignUpProps> = ({ isOpen, onClose }) => {
  const [mode, setMode]                 = useState<Mode>('login');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const handleModalClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const reset = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setShowPassword(false);
  };

  const switchMode = (next: Mode) => {
    reset();
    setMode(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (mode === 'register' && password.trim().length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'register'
        ? `${API_BASE}/auth/register`
        : `${API_BASE}/auth/login`;

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message = Array.isArray(data?.message)
          ? data.message[0]
          : data?.message ?? data?.error ?? 'Something went wrong.';
        setError(message);
        return;
      }

      if (mode === 'login' && data?.token) {
        window.localStorage.setItem(ACCESS_TOKEN_KEY, data.token);
      }

      onClose();
      window.location.href = '/dashboard';
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500;600&display=swap');

        @keyframes stratum-modal-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes stratum-spin { to { transform: rotate(360deg); } }

        .stratum-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(232,185,106,0.14);
          background: rgba(232,185,106,0.04);
          color: #F0EDE8;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .stratum-input::placeholder { color: rgba(220,215,205,0.28); }
        .stratum-input:focus {
          border-color: rgba(232,185,106,0.38);
          box-shadow: 0 0 0 3px rgba(232,185,106,0.07);
        }
        .stratum-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 100px #0B1018 inset;
          -webkit-text-fill-color: #F0EDE8;
        }
      `}</style>

      <div
        onClick={handleModalClick}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          background: 'rgba(4,7,14,0.75)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            background: '#0B1018',
            border: '1px solid rgba(232,185,106,0.14)',
            borderRadius: 20,
            padding: '32px 28px',
            width: '100%',
            maxWidth: 380,
            boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(232,185,106,0.05)',
            animation: 'stratum-modal-in 0.25s cubic-bezier(0.22,1,0.36,1) both',
            position: 'relative',
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(232,185,106,0.1)', background: 'rgba(232,185,106,0.04)', color: 'rgba(220,215,205,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#F0EDE8'; b.style.borderColor = 'rgba(232,185,106,0.25)'; b.style.background = 'rgba(232,185,106,0.08)'; }}
            onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'rgba(220,215,205,0.45)'; b.style.borderColor = 'rgba(232,185,106,0.1)'; b.style.background = 'rgba(232,185,106,0.04)'; }}
          >
            <X size={14} />
          </button>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            {/* Strata mark */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 16 }}>
              {[0.28, 0.55, 1].map((op, i) => (
                <span key={i} style={{ display: 'block', height: 2, borderRadius: 2, background: '#E8B96A', opacity: op, width: 12 + i * 6 }} />
              ))}
            </div>

            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: '#F0EDE8', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
              {mode === 'login' ? 'Sign in to Stratum' : 'Create your account'}
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(220,215,205,0.4)', margin: 0, lineHeight: 1.5 }}>
              {mode === 'login'
                ? 'Enter your credentials to continue'
                : 'Start recovering what text strips away'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500, color: 'rgba(220,215,205,0.45)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 7 }}>
                Email
              </label>
              <input
                type="email"
                className="stratum-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500, color: 'rgba(220,215,205,0.45)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="stratum-input"
                  placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  style={{ paddingRight: 42 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(220,215,205,0.3)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(232,185,106,0.7)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(220,215,205,0.3)')}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#FCA5A5', lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{ marginTop: 2, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 20px', borderRadius: 99, border: 'none', background: loading ? 'rgba(212,146,60,0.45)' : 'linear-gradient(135deg, #D4923C 0%, #C8725A 100%)', color: '#080C14', fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.01em', boxShadow: loading ? 'none' : '0 0 24px rgba(212,146,60,0.22)', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => { if (loading) return; const b = e.currentTarget as HTMLButtonElement; b.style.transform = 'translateY(-1px)'; b.style.boxShadow = '0 0 32px rgba(212,146,60,0.38)'; }}
              onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.transform = 'translateY(0)'; b.style.boxShadow = loading ? 'none' : '0 0 24px rgba(212,146,60,0.22)'; }}
            >
              {loading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'stratum-spin 0.7s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Mode toggle */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(220,215,205,0.38)' }}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </span>
            <button
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: '#E8B96A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3, opacity: 0.8, transition: 'opacity 0.15s' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.8')}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>

          {/* Legal */}
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(220,215,205,0.22)', textAlign: 'center', margin: '16px 0 0', lineHeight: 1.6 }}>
            By continuing, you agree to our{' '}
            <a href="#" style={{ color: 'rgba(232,185,106,0.5)', textDecoration: 'underline', textUnderlineOffset: 2 }}>Terms</a>
            {' '}and{' '}
            <a href="#" style={{ color: 'rgba(232,185,106,0.5)', textDecoration: 'underline', textUnderlineOffset: 2 }}>Privacy Policy</a>
          </p>
        </div>
      </div>
    </>
  );
};

export default SignUp;