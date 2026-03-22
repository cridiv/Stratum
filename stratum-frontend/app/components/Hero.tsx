'use client'
import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import SignUp from '../signin/Signin';

const Hero: React.FC = () => {
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);

  const openSignupModal = () => {
    setIsSignupModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeSignupModal = () => {
    setIsSignupModalOpen(false);
    document.body.style.overflow = 'unset';
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        .stratum-hero {
          font-family: 'DM Sans', sans-serif;
        }

        .stratum-headline {
          font-family: 'Syne', sans-serif;
        }

        @keyframes stratum-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes stratum-pulse-slow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 0.8; transform: scale(1.04); }
        }

        @keyframes stratum-scan {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(500%); opacity: 0; }
        }

        @keyframes waveform-bar {
          0%, 100% { transform: scaleY(0.4); }
          50%       { transform: scaleY(1); }
        }

        .hero-fade-1 { animation: stratum-fade-up 0.7s ease 0.1s both; }
        .hero-fade-2 { animation: stratum-fade-up 0.7s ease 0.25s both; }
        .hero-fade-3 { animation: stratum-fade-up 0.7s ease 0.4s both; }
        .hero-fade-4 { animation: stratum-fade-up 0.7s ease 0.55s both; }

        .scan-line {
          animation: stratum-scan 4s ease-in-out infinite;
        }

        .strata-layer {
          position: absolute;
          left: 0; right: 0;
          pointer-events: none;
        }
      `}</style>

      <main
        className="stratum-hero min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 relative overflow-hidden"
        style={{ background: '#080C14' }}
      >
        {/* ── Strata background layers ──────────────────────────────────── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {/* Horizontal strata bands */}
          {[
            { top: '12%',  h: 1,   opacity: 0.06 },
            { top: '26%',  h: 1,   opacity: 0.08 },
            { top: '38%',  h: 2,   opacity: 0.05 },
            { top: '52%',  h: 1,   opacity: 0.09 },
            { top: '64%',  h: 1,   opacity: 0.06 },
            { top: '78%',  h: 2,   opacity: 0.05 },
            { top: '88%',  h: 1,   opacity: 0.07 },
          ].map((l, i) => (
            <div
              key={i}
              className="strata-layer"
              style={{
                top: l.top,
                height: l.h,
                background: `linear-gradient(90deg, transparent 0%, #E8B96A ${30 + i * 7}%, #C8955A ${50 + i * 4}%, transparent 100%)`,
                opacity: l.opacity,
              }}
            />
          ))}

          {/* Deep amber glow — bottom center */}
          <div
            style={{
              position: 'absolute',
              bottom: '-10%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 700,
              height: 400,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(214,144,72,0.12) 0%, transparent 70%)',
            }}
          />

          {/* Subtle top-left cool light */}
          <div
            style={{
              position: 'absolute',
              top: '-5%',
              left: '-5%',
              width: 500,
              height: 500,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(96,120,180,0.07) 0%, transparent 65%)',
            }}
          />

          {/* Animated waveform visualizer — center background */}
          <div
            style={{
              position: 'absolute',
              bottom: '18%',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 3,
              height: 48,
              opacity: 0.09,
            }}
          >
            {Array.from({ length: 48 }).map((_, i) => {
              const baseH = 8 + Math.sin(i * 0.5) * 12 + Math.sin(i * 0.2) * 8;
              return (
                <div
                  key={i}
                  style={{
                    width: 2,
                    height: Math.max(4, baseH),
                    borderRadius: 2,
                    background: '#E8B96A',
                    transformOrigin: 'bottom',
                    animation: `waveform-bar ${1.2 + (i % 5) * 0.18}s ease-in-out ${(i % 7) * 0.11}s infinite`,
                  }}
                />
              );
            })}
          </div>

          {/* Scan line */}
          <div
            className="scan-line"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(232,185,106,0.25), transparent)',
            }}
          />

          {/* Fine grid overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(rgba(232,185,106,0.025) 1px, transparent 1px),
                linear-gradient(90deg, rgba(232,185,106,0.025) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="relative z-10 max-w-3xl mx-auto w-full">

          {/* Eyebrow label */}
          <div className="hero-fade-1 flex justify-center mb-7">
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#E8B96A',
              border: '1px solid rgba(232,185,106,0.25)',
              borderRadius: 99,
              padding: '5px 14px',
              background: 'rgba(232,185,106,0.06)',
            }}>
              Audio Intelligence
            </span>
          </div>

          {/* Headline */}
          <div className="hero-fade-2 mb-6">
            <h1
              className="stratum-headline"
              style={{
                fontSize: 'clamp(36px, 6vw, 68px)',
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                color: '#F0EDE8',
                margin: 0,
              }}
            >
              Speech Reveals More Than{' '}
              <span style={{
                position: 'relative',
                display: 'inline-block',
                color: '#E8B96A',
              }}>
                Words
                {/* Underline accent */}
                <span style={{
                  position: 'absolute',
                  bottom: -4,
                  left: 0,
                  right: 0,
                  height: 2,
                  borderRadius: 99,
                  background: 'linear-gradient(90deg, #E8B96A, #C8725A)',
                  opacity: 0.7,
                }} />
              </span>
            </h1>
          </div>

          {/* Sub-copy */}
          <div className="hero-fade-3" style={{ marginBottom: 44 }}>
            <p style={{
              fontSize: 'clamp(15px, 1.8vw, 18px)',
              lineHeight: 1.7,
              color: 'rgba(220,215,205,0.65)',
              fontWeight: 300,
              maxWidth: 520,
              margin: '0 auto',
            }}>
              When speech becomes text, the emotion behind it disappears.{' '}
              <span style={{ color: 'rgba(220,215,205,0.9)', fontWeight: 400 }}>
                Stratum recovers it
              </span>{' '}
              — surfacing confidence, hesitation, and tone as structured intelligence.
            </p>
          </div>

          {/* CTAs */}
          <div className="hero-fade-4" style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={openSignupModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '13px 28px',
                borderRadius: 99,
                border: 'none',
                background: 'linear-gradient(135deg, #D4923C 0%, #C8725A 100%)',
                color: '#080C14',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.01em',
                boxShadow: '0 0 28px rgba(212,146,60,0.3), 0 4px 16px rgba(0,0,0,0.4)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 36px rgba(212,146,60,0.45), 0 6px 20px rgba(0,0,0,0.5)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 28px rgba(212,146,60,0.3), 0 4px 16px rgba(0,0,0,0.4)';
              }}
            >
              Get started
              <ArrowRight size={15} />
            </button>

            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 28px',
                borderRadius: 99,
                border: '1px solid rgba(240,237,232,0.15)',
                background: 'rgba(240,237,232,0.04)',
                color: 'rgba(240,237,232,0.75)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(232,185,106,0.35)';
                (e.currentTarget as HTMLButtonElement).style.color = '#E8B96A';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(232,185,106,0.06)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(240,237,232,0.15)';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(240,237,232,0.75)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(240,237,232,0.04)';
              }}
            >
              See how it works
            </button>
          </div>

          {/* Social proof / trust line */}
          <div
            className="hero-fade-4"
            style={{
              marginTop: 52,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              flexWrap: 'wrap',
            }}
          >
            {[
              { value: 'Emotion', label: 'detection' },
              { value: 'Confidence', label: 'scoring' },
              { value: 'Tone', label: 'analysis' },
              { value: 'Hesitation', label: 'mapping' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {i > 0 && (
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(232,185,106,0.3)', display: 'inline-block' }} />
                )}
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(220,215,205,0.45)' }}>
                  <span style={{ color: 'rgba(232,185,106,0.7)', fontWeight: 500 }}>{item.value}</span>{' '}{item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {isSignupModalOpen && (
        <SignUp isOpen={isSignupModalOpen} onClose={closeSignupModal} />
      )}
    </>
  );
};

export default Hero;