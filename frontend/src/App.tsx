import { useState } from 'react';
import { useEditor } from './hooks/useEditor';
import { EditorCanvas } from './components/EditorCanvas';
import { LeftPanel } from './components/LeftPanel';
import { ExportDrawer } from './components/ExportDrawer';
import { LegalModal } from './components/LegalModal';

const ACCENT = '#e94f37';

export default function App() {
  const { state, setFile, setBackground, setCanvas, setContent } = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const [legalPage, setLegalPage] = useState<'privacy' | 'terms' | null>(null);

  return (
    <div className="h-screen overflow-hidden select-none" style={{ display: 'flex', background: '#161616' }}>
      {/* Wordmark */}
      <span style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10, fontSize: 24, color: ACCENT, fontFamily: '"Rubik", sans-serif', fontWeight: 900, letterSpacing: '-0.01em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        moka
      </span>

      <LeftPanel
        state={state}
        onUploaded={setFile}
        onBackground={setBackground}
        onCanvas={setCanvas}
        onContent={setContent}
        onExport={() => setExportOpen(true)}
      />

      {/* Preview area + footer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <EditorCanvas state={state} onContentChange={setContent} onUploaded={setFile} />
        </div>

        {/* Footer */}
        <footer style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          padding: '8px 24px', flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          {/* Credit */}
          <span style={{ fontSize: 11, color: '#333', whiteSpace: 'nowrap' }}>
            Made with{' '}
            <span style={{ color: ACCENT }}>♥</span>
            {' '}by{' '}
            <a href="https://alvaroso.dev" target="_blank" rel="noopener noreferrer"
              style={{ color: '#555', textDecoration: 'none', fontWeight: 600, transition: 'color 0.12s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
            >@aka_alvaroso</a>
          </span>

          <span style={{ color: '#222', fontSize: 11 }}>·</span>

          {/* Repo */}
          <a href="https://github.com/aka-alvaroso/moka" target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#333', textDecoration: 'none', fontSize: 11, transition: 'color 0.12s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#666'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#333'; }}
          >
            <GitHubIcon />
            Source code
          </a>

          <span style={{ color: '#222', fontSize: 11 }}>·</span>

          {/* Legal */}
          <span style={{ display: 'flex', gap: 10, fontSize: 11 }}>
            <button onClick={() => setLegalPage('privacy')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#333', padding: 0, fontSize: 11, transition: 'color 0.12s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#666')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#333')}
            >Privacy</button>
            <button onClick={() => setLegalPage('terms')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#333', padding: 0, fontSize: 11, transition: 'color 0.12s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#666')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#333')}
            >Terms</button>
          </span>
        </footer>
      </div>

      <ExportDrawer state={state} open={exportOpen} onClose={() => setExportOpen(false)} />
      <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}
