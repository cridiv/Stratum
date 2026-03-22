'use client'
import React, { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import Image from 'next/image';
import SignUp from '../signin/Signin';

const NavBar: React.FC = () => {
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const openSignupModal = () => {
    setIsSignupModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeSignupModal = () => {
    setIsSignupModalOpen(false);
    document.body.style.overflow = 'unset';
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((v) => !v);
    document.body.style.overflow = isMobileMenuOpen ? 'unset' : 'hidden';
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    document.body.style.overflow = 'unset';
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=DM+Sans:wght@400;500&display=swap');
        .stratum-nav-link {
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 400;
          color: rgba(220,215,205,0.55);
          padding: 6px 14px;
          border-radius: 8px;
          transition: color 0.15s, background 0.15s;
          text-decoration: none;
          letter-spacing: 0.01em;
        }
        .stratum-nav-link:hover {
          color: #E8B96A;
          background: rgba(232,185,106,0.07);
        }
      `}</style>

      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(8,12,20,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(232,185,106,0.08)',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <nav
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '0 24px',
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Wordmark */}
          <a
            href="/"
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 18,
              fontWeight: 700,
              color: '#F0EDE8',
              textDecoration: 'none',
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Image
              src="/stratum-mark.svg"
              alt="Stratum mark"
              width={18}
              height={18}
              style={{ display: 'block', borderRadius: 4 }}
            />
            Stratum
          </a>

          {/* Desktop nav */}
          <div className="hidden md:flex" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <a href="/about"   className="stratum-nav-link">About</a>
            <a href="/contact" className="stratum-nav-link">Contact</a>

            {/* Divider */}
            <span style={{ width: 1, height: 18, background: 'rgba(232,185,106,0.15)', margin: '0 8px', display: 'inline-block' }} />

            <button
              onClick={openSignupModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 20px',
                borderRadius: 99,
                border: 'none',
                background: 'linear-gradient(135deg, #D4923C 0%, #C8725A 100%)',
                color: '#080C14',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.01em',
                boxShadow: '0 0 16px rgba(212,146,60,0.2)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(212,146,60,0.35)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 16px rgba(212,146,60,0.2)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              Sign up
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={toggleMobileMenu}
            style={{
              display: 'none',
              padding: 8,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: 'rgba(240,237,232,0.7)',
              cursor: 'pointer',
            }}
            className="md-hidden-show"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>
      </div>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 49 }}>
          <div
            onClick={closeMobileMenu}
            style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,20,0.7)', backdropFilter: 'blur(4px)' }}
          />
          <div
            style={{
              position: 'absolute',
              top: 68,
              left: 16,
              right: 16,
              background: '#0E1420',
              border: '1px solid rgba(232,185,106,0.12)',
              borderRadius: 16,
              padding: '20px 20px 24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
              {['About', 'Contact'].map((label) => (
                <a
                  key={label}
                  href={`/${label.toLowerCase()}`}
                  onClick={closeMobileMenu}
                  style={{
                    display: 'block',
                    padding: '10px 14px',
                    borderRadius: 8,
                    color: 'rgba(220,215,205,0.65)',
                    fontSize: 14,
                    textDecoration: 'none',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#E8B96A'; (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(232,185,106,0.07)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(220,215,205,0.65)'; (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
                >
                  {label}
                </a>
              ))}
            </div>

            {/* Hairline */}
            <div style={{ height: 1, background: 'rgba(232,185,106,0.1)', marginBottom: 20 }} />

            <button
              onClick={() => { closeMobileMenu(); openSignupModal(); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 20px',
                borderRadius: 99,
                border: 'none',
                background: 'linear-gradient(135deg, #D4923C 0%, #C8725A 100%)',
                color: '#080C14',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(212,146,60,0.25)',
              }}
            >
              Sign up
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {isSignupModalOpen && (
        <SignUp isOpen={isSignupModalOpen} onClose={closeSignupModal} />
      )}
    </>
  );
};

export default NavBar;