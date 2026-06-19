import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useEditor } from './hooks/useEditor';
import { EditorCanvas } from './components/EditorCanvas';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { ExportDrawer } from './components/ExportDrawer';
import { LegalModal } from './components/LegalModal';
import { TimelineBar } from './components/TimelineBar';
import { interpolateProps } from './lib/interpolate';
import { useTheme } from './context/ThemeContext';
import type { ThemeMode } from './context/ThemeContext';
import type { AnimatedProps, AnimationConfig } from '@mockup-forge/shared';

const ACCENT = '#e94f37';

export default function App() {
  const {
    state,
    addItem, removeItem, selectItem, moveItemToIndex,
    setItemContent, setItemContentAndKeyframe, setItemVideoEndBehavior,
    addKeyframe, removeKeyframe, moveKeyframe, duplicateKeyframe, updateKeyframeProps, updateKeyframeEasing, clearKeyframes,
    setBackground, setCanvas, setAnimationConfig,
  } = useEditor();

  const { mode, colors, setMode } = useTheme();

  const [exportOpen,     setExportOpen]     = useState(false);
  const [legalPage,      setLegalPage]      = useState<'privacy' | 'terms' | null>(null);
  const [timelineOpen,   setTimelineOpen]   = useState(false);
  const [playing,        setPlaying]        = useState(false);
  const [currentTime,    setCurrentTime]    = useState(0);
  const [allAnimatedProps, setAllAnimatedProps] = useState<Record<string, AnimatedProps>>({});
  const [scrubbing,      setScrubbing]      = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [loop,           setLoop]           = useState(false);
  const [selectedKfId,   setSelectedKfId]   = useState<string | null>(null);
  const [leftOpen,       setLeftOpen]       = useState(true);
  const [rightOpen,      setRightOpen]      = useState(true);
  const [windowWidth,    setWindowWidth]    = useState(window.innerWidth);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const rafRef      = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const loopRef     = useRef(false);

  useEffect(() => { loopRef.current = loop; }, [loop]);
  useEffect(() => { setSelectedKfId(null); }, [state.selectedItemId]);

  const selectedItem = state.mediaItems.find((i) => i.id === state.selectedItemId) ?? null;

  const animationConfig: AnimationConfig = {
    enabled: state.animationEnabled,
    duration: state.animationDuration,
    fps: state.animationFps,
    keyframes: selectedItem?.keyframes ?? [],
  };

  // ── Playback loop ──────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTickRef.current = null;
  }, []);

  const computeAllAnimatedProps = useCallback((time: number) => {
    const props: Record<string, AnimatedProps> = {};
    for (const item of state.mediaItems) {
      if (item.keyframes.length > 0) {
        const p = interpolateProps(item.keyframes, time);
        if (p) props[item.id] = p;
      }
    }
    return props;
  }, [state.mediaItems]);

  useEffect(() => {
    if (!playing) {
      setAllAnimatedProps(computeAllAnimatedProps(currentTime));
      return;
    }
    const tick = (now: number) => {
      const delta = lastTickRef.current !== null ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;
      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= state.animationDuration) {
          if (loopRef.current) {
            lastTickRef.current = now;
            setAllAnimatedProps(computeAllAnimatedProps(0));
            return 0;
          }
          stopPlayback();
          setCurrentTime(state.animationDuration);
          setAllAnimatedProps(computeAllAnimatedProps(state.animationDuration));
          return state.animationDuration;
        }
        setAllAnimatedProps(computeAllAnimatedProps(next));
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing, state.animationDuration, currentTime, stopPlayback, computeAllAnimatedProps]);

  useEffect(() => {
    if (!playing) setAllAnimatedProps(computeAllAnimatedProps(currentTime));
  }, [currentTime, playing, computeAllAnimatedProps]);

  useEffect(() => {
    if (!timelineOpen) {
      setScrubbing(false);
    }
  }, [timelineOpen]);

  // Close settings on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const handlePlayToggle = () => {
    if (playing) {
      stopPlayback();
    } else {
      if (currentTime >= state.animationDuration) setCurrentTime(0);
      lastTickRef.current = null;
      setPlaying(true);
    }
  };

  const handleItemContentChange = useCallback((id: string, patch: Partial<import('@mockup-forge/shared').ContentOptions>) => {
    if (timelineOpen) {
      if (selectedKfId) {
        // Editar el keyframe seleccionado directamente, sin importar el playhead
        updateKeyframeProps(id, selectedKfId, patch);
      } else {
        const item = state.mediaItems.find((i) => i.id === id);
        const hasKeyframes = (item?.keyframes.length ?? 0) > 0;
        if (hasKeyframes) setItemContentAndKeyframe(id, patch, currentTime);
        else setItemContent(id, patch);
      }
    } else {
      setItemContent(id, patch);
    }
  }, [timelineOpen, selectedKfId, currentTime, state.mediaItems, setItemContent, setItemContentAndKeyframe, updateKeyframeProps]);

  const handleSelectedContentChange = useCallback((patch: Partial<import('@mockup-forge/shared').ContentOptions>) => {
    if (!state.selectedItemId) return;
    handleItemContentChange(state.selectedItemId, patch);
  }, [state.selectedItemId, handleItemContentChange]);

  const isAnimating = playing || scrubbing;
  const hasAnimatedItems = state.mediaItems.some((i) => i.keyframes.length > 0);

  return (
    <div
      data-theme={mode}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: colors.bgApp, transition: 'background 0.2s' }}
      className="select-none"
    >
      {/* Screen too small overlay */}
      {windowWidth < 1024 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: colors.bgApp,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 32,
        }}>
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="moka" style={{ height: 36, marginBottom: 8 }} />
          <p style={{ color: colors.fg, fontSize: 18, fontWeight: 700, textAlign: 'center', margin: 0 }}>
            Your screen is too small
          </p>
          <p style={{ color: colors.fgSubtle, fontSize: 14, textAlign: 'center', margin: 0, maxWidth: 300 }}>
            Moka requires a screen at least 1024px wide. Try expanding your browser window or use a larger device.
          </p>
        </div>
      )}

      {/* Main row */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Logo */}
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="moka"
          style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 10, height: 28, pointerEvents: 'none' }} />

        {/* Left panel + collapse wrapper */}
        <motion.div
          animate={{ width: leftOpen ? 288 : 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          style={{ overflow: 'hidden', flexShrink: 0 }}
        >
          <LeftPanel
            state={state}
            onItemAdded={addItem}
            onItemRemoved={removeItem}
            onItemSelected={selectItem}
            onItemReorder={moveItemToIndex}
            onBackground={setBackground}
            onCanvas={setCanvas}
            onExport={() => setExportOpen(true)}
          />
        </motion.div>

        {/* Left panel toggle */}
        <PanelToggle side="left" open={leftOpen} onClick={() => setLeftOpen((v) => !v)} colors={colors} />

        {/* Center */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, paddingTop: 18 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <EditorCanvas
              state={state}
              onItemContentChange={handleItemContentChange}
              onItemSelected={selectItem}
              onItemAdded={addItem}
              allAnimatedProps={timelineOpen || isAnimating ? allAnimatedProps : {}}
              isAnimating={isAnimating}
            />
          </div>

          {/* Animate button + play control */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 12px 0', flexShrink: 0 }}>
            {/* Loop toggle */}
            <button
              onClick={() => setLoop((v) => !v)}
              title={loop ? 'Loop: on' : 'Loop: off'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: loop ? ACCENT + '22' : 'transparent',
                border: `1px solid ${loop ? ACCENT + '88' : 'rgba(255,255,255,0.10)'}`,
                color: loop ? ACCENT : '#666',
                cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s, background 0.15s',
              }}
            >
              <LoopIcon />
            </button>

            {/* Play / Pause */}
            <button
              onClick={handlePlayToggle}
              title={playing ? 'Pause' : 'Play'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: playing ? '#c73e2b' : ACCENT,
                border: 'none', color: '#fff', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {playing ? <PauseIconLg /> : <PlayIconLg />}
            </button>

            {/* Animate / Close */}
            <button
              onClick={() => setTimelineOpen((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 28px',
                borderRadius: 12, fontSize: 13, fontWeight: 900,
                background: timelineOpen ? '#c73e2b' : ACCENT,
                border: 'none', color: '#fff', cursor: 'pointer',
                transition: 'background 0.15s', letterSpacing: '0.04em',
              }}
            >
              <PlayIcon open={timelineOpen} />
              {timelineOpen ? 'Close animation' : 'Animate'}
            </button>
          </div>

          {/* Footer */}
          <footer style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: '8px 24px', flexShrink: 0,
            borderTop: `1px solid ${colors.divider}`, marginTop: 12,
          }}>
            {/* Settings button */}
            <div ref={settingsRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: settingsOpen ? ACCENT : 'transparent',
                  border: 'none', cursor: 'pointer',
                  color: settingsOpen ? '#fff' : colors.fgSubtle,
                  fontSize: 11, fontWeight: 600, padding: '4px 10px',
                  borderRadius: 8, transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => { if (!settingsOpen) e.currentTarget.style.color = colors.fgDim; }}
                onMouseLeave={(e) => { if (!settingsOpen) e.currentTarget.style.color = colors.fgSubtle; }}
              >
                <GearIcon /> Settings
              </button>

              {/* Settings popover */}
              {settingsOpen && (
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
                  background: colors.bgPanel, borderRadius: 14,
                  boxShadow: mode === 'dark'
                    ? '0 8px 32px rgba(0,0,0,0.6)'
                    : '0 8px 32px rgba(0,0,0,0.15)',
                  padding: '14px 14px 10px', minWidth: 180, zIndex: 100,
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.sectionLabel, margin: '0 0 10px' }}>Theme</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['dark', 'light'] as ThemeMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
                          cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: mode === m ? ACCENT : colors.bgRow,
                          color: mode === m ? '#fff' : colors.fgDim,
                          transition: 'background 0.15s, color 0.15s',
                          textTransform: 'capitalize',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span style={{ color: colors.divider, fontSize: 11 }}>·</span>

            <span style={{ fontSize: 11, color: colors.fgSubtle, whiteSpace: 'nowrap' }}>
              Made with <span style={{ color: ACCENT }}>♥</span> by{' '}
              <a href="https://alvaroso.dev" target="_blank" rel="noopener noreferrer"
                style={{ color: colors.fgDim, textDecoration: 'none', fontWeight: 600 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
                onMouseLeave={(e) => (e.currentTarget.style.color = colors.fgDim)}
              >@aka_alvaroso</a>
            </span>
            <span style={{ color: colors.divider, fontSize: 11 }}>·</span>
            <a href="https://github.com/aka-alvaroso/moka" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, color: colors.fgSubtle, textDecoration: 'none', fontSize: 11 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = colors.fgDim; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = colors.fgSubtle; }}
            >
              <GitHubIcon /> Source code
            </a>
            <span style={{ color: colors.divider, fontSize: 11 }}>·</span>
            <span style={{ display: 'flex', gap: 10, fontSize: 11 }}>
              <FooterBtn onClick={() => setLegalPage('privacy')} color={colors.fgSubtle} hoverColor={colors.fgDim}>Privacy</FooterBtn>
              <FooterBtn onClick={() => setLegalPage('terms')} color={colors.fgSubtle} hoverColor={colors.fgDim}>Terms</FooterBtn>
            </span>
          </footer>
        </div>

        {/* Right panel toggle */}
        <PanelToggle side="right" open={rightOpen} onClick={() => setRightOpen((v) => !v)} colors={colors} />

        {/* Right panel + collapse wrapper */}
        <motion.div
          animate={{ width: rightOpen ? 288 : 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          style={{ overflow: 'hidden', flexShrink: 0 }}
        >
          <RightPanel
            item={selectedItem}
            onContent={handleSelectedContentChange}
            onVideoEndBehavior={(behavior) => { if (state.selectedItemId) setItemVideoEndBehavior(state.selectedItemId, behavior); }}
          />
        </motion.div>
      </div>

      {/* Timeline bar */}
      <AnimatePresence>
        {timelineOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <TimelineBar
              animation={animationConfig}
              currentTime={currentTime}
              selectedKfId={selectedKfId}
              onKeyframeSelect={setSelectedKfId}
              onTimeChange={(t) => { setCurrentTime(t); if (playing) stopPlayback(); }}
              onScrubStart={() => setScrubbing(true)}
              onScrubEnd={() => setScrubbing(false)}
              onAddKeyframe={(time) => { if (state.selectedItemId) addKeyframe(state.selectedItemId, time); }}
              onMoveKeyframe={(kfId, time) => { if (state.selectedItemId) moveKeyframe(state.selectedItemId, kfId, time); }}
              onDuplicateKeyframe={(kfId) => { if (state.selectedItemId) duplicateKeyframe(state.selectedItemId, kfId, currentTime); }}
              onRemoveKeyframe={(kfId) => { if (state.selectedItemId) removeKeyframe(state.selectedItemId, kfId); }}
              onClearKeyframes={() => { if (state.selectedItemId) clearKeyframes(state.selectedItemId); }}
              onUpdateEasing={(kfId, easing) => { if (state.selectedItemId) updateKeyframeEasing(state.selectedItemId, kfId, easing); }}
              onAnimationChange={(patch) => setAnimationConfig({
                ...(patch.enabled   !== undefined && { animationEnabled:   patch.enabled   }),
                ...(patch.duration  !== undefined && { animationDuration:  patch.duration  }),
                ...(patch.fps       !== undefined && { animationFps:       patch.fps       }),
              })}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ExportDrawer state={state} open={exportOpen} onClose={() => setExportOpen(false)} />
      <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />
    </div>
  );
}

function PanelToggle({ side, open, onClick, colors }: { side: 'left' | 'right'; open: boolean; onClick: () => void; colors: ReturnType<typeof import('./context/ThemeContext').useTheme>['colors'] }) {
  const pointsRight = (side === 'left') ? open : !open;
  return (
    <button
      onClick={onClick}
      title={open ? 'Collapse panel' : 'Expand panel'}
      style={{
        flexShrink: 0, alignSelf: 'center',
        width: 16, height: 48, borderRadius: 6,
        background: 'transparent', border: 'none',
        cursor: 'pointer', color: colors.fgSubtle,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.15s, background 0.15s',
        padding: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = colors.fgDim; e.currentTarget.style.background = colors.bgRow; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = colors.fgSubtle; e.currentTarget.style.background = 'transparent'; }}
    >
      <motion.svg
        width="10" height="10"
        viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        animate={{ rotate: pointsRight ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <path d="m9 18 6-6-6-6" />
      </motion.svg>
    </button>
  );
}

function FooterBtn({ onClick, children, color, hoverColor }: { onClick: () => void; children: React.ReactNode; color: string; hoverColor: string }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, fontSize: 11 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = hoverColor)}
      onMouseLeave={(e) => (e.currentTarget.style.color = color)}
    >{children}</button>
  );
}

function GearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
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
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)', transform: open ? 'rotate(90deg)' : 'rotate(-90deg)' }}
    >
      <path d="m7 18 6-6-6-6"/><path d="M17 6v12"/>
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

function PlayIconLg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  );
}

function PauseIconLg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="5" height="16" rx="1.5"/><rect x="15" y="4" width="5" height="16" rx="1.5"/>
    </svg>
  );
}
