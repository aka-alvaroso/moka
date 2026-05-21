import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor } from './hooks/useEditor';
import { EditorCanvas } from './components/EditorCanvas';
import { LeftPanel } from './components/LeftPanel';
import { ExportDrawer } from './components/ExportDrawer';
import { LegalModal } from './components/LegalModal';
import { TimelineBar } from './components/TimelineBar';
import { interpolateProps } from './lib/interpolate';
import type { AnimatedProps } from '@mockup-forge/shared';

const ACCENT = '#e94f37';

export default function App() {
  const {
    state, setFile, setBackground, setCanvas, setContent, setContentAndKeyframe,
    setAnimation, addKeyframe, removeKeyframe, updateKeyframeEasing,
  } = useEditor();

  const [exportOpen,    setExportOpen]    = useState(false);
  const [legalPage,     setLegalPage]     = useState<'privacy' | 'terms' | null>(null);
  const [timelineOpen,  setTimelineOpen]  = useState(false);
  const [playing,       setPlaying]       = useState(false);
  const [currentTime,   setCurrentTime]   = useState(0);
  const [animatedProps, setAnimatedProps] = useState<AnimatedProps | null>(null);
  const [scrubbing,     setScrubbing]     = useState(false);

  const rafRef      = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  // ── Playback loop ─────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTickRef.current = null;
  }, []);

  useEffect(() => {
    if (!playing) {
      setAnimatedProps(interpolateProps(state.animation.keyframes, currentTime));
      return;
    }

    const tick = (now: number) => {
      const delta = lastTickRef.current !== null ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= state.animation.duration) {
          stopPlayback();
          setCurrentTime(state.animation.duration);
          setAnimatedProps(interpolateProps(state.animation.keyframes, state.animation.duration));
          return state.animation.duration;
        }
        setAnimatedProps(interpolateProps(state.animation.keyframes, next));
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing, state.animation.keyframes, state.animation.duration, currentTime, stopPlayback]);

  // Update preview when scrubbing (not playing)
  useEffect(() => {
    if (!playing) {
      setAnimatedProps(interpolateProps(state.animation.keyframes, currentTime));
    }
  }, [currentTime, state.animation.keyframes, playing]);

  // Clear animated props when timeline closed
  useEffect(() => {
    if (!timelineOpen) { setAnimatedProps(null); stopPlayback(); setCurrentTime(0); setScrubbing(false); }
  }, [timelineOpen, stopPlayback]);

  const handlePlayToggle = () => {
    if (playing) {
      stopPlayback();
    } else {
      if (currentTime >= state.animation.duration) setCurrentTime(0);
      lastTickRef.current = null;
      setPlaying(true);
    }
  };

  const handleContentChange = (patch: Parameters<typeof setContent>[0]) => {
    if (timelineOpen) setContentAndKeyframe(patch, currentTime);
    else setContent(patch);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#161616' }}
      className="select-none">

      {/* Main row: panel + preview */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Wordmark */}
        <img src="/Moka.svg" alt="moka" style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 10, height: 28, pointerEvents: 'none' }} />

        <LeftPanel
          state={state}
          onUploaded={setFile}
          onBackground={setBackground}
          onCanvas={setCanvas}
          onContent={handleContentChange}
          onExport={() => setExportOpen(true)}
        />

        {/* Preview area + footer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, paddingTop: 18 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <EditorCanvas
              state={state}
              onContentChange={handleContentChange}
              onUploaded={setFile}
              animatedProps={(playing || scrubbing) ? animatedProps : null}
            />
          </div>

          {/* Animate button */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 12px 0', flexShrink: 0 }}>
            <button
              onClick={() => setTimelineOpen((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 28px', borderRadius: 12, fontSize: 13, fontWeight: 900,
                background: timelineOpen ? '#c73e2b' : ACCENT,
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                transition: 'background 0.15s',
                letterSpacing: '0.04em',
              }}
            >
              <PlayIcon open={timelineOpen} /> {timelineOpen ? 'Close animation' : 'Animate'}
            </button>
          </div>

          {/* Footer */}
          <footer style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            padding: '8px 24px', flexShrink: 0,
            borderTop: '1px solid rgba(255,255,255,0.04)',
            marginTop: 12,
          }}>
            <span style={{ fontSize: 11, color: '#333', whiteSpace: 'nowrap' }}>
              Made with <span style={{ color: ACCENT }}>♥</span> by{' '}
              <a href="https://alvaroso.dev" target="_blank" rel="noopener noreferrer"
                style={{ color: '#555', textDecoration: 'none', fontWeight: 600 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
              >@aka_alvaroso</a>
            </span>
            <span style={{ color: '#222', fontSize: 11 }}>·</span>
            <a href="https://github.com/aka-alvaroso/moka" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#333', textDecoration: 'none', fontSize: 11 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#666'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#333'; }}
            >
              <GitHubIcon /> Source code
            </a>
            <span style={{ color: '#222', fontSize: 11 }}>·</span>
            <span style={{ display: 'flex', gap: 10, fontSize: 11 }}>
              <FooterBtn onClick={() => setLegalPage('privacy')}>Privacy</FooterBtn>
              <FooterBtn onClick={() => setLegalPage('terms')}>Terms</FooterBtn>
            </span>
          </footer>
        </div>
      </div>

      {/* Timeline bar — collapsible */}
      {timelineOpen && (
        <TimelineBar
          animation={state.animation}
          currentTime={currentTime}
          playing={playing}
          onTimeChange={(t) => { setCurrentTime(t); if (playing) stopPlayback(); }}
          onScrubStart={() => setScrubbing(true)}
          onScrubEnd={() => setScrubbing(false)}
          onPlayToggle={handlePlayToggle}
          onRemoveKeyframe={removeKeyframe}
          onUpdateEasing={updateKeyframeEasing}
          onAnimationChange={setAnimation}
        />
      )}

      <ExportDrawer state={state} open={exportOpen} onClose={() => setExportOpen(false)} />
      <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />
    </div>
  );
}

function FooterBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#333', padding: 0, fontSize: 11 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#666')}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#333')}
    >{children}</button>
  );
}

function GitHubIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function PlayIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="5" height="16" rx="1.5"/>
      <rect x="15" y="4" width="5" height="16" rx="1.5"/>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  );
}
