import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const ACCENT = '#e94f37';

const PRIVACY = {
  title: 'Privacy Policy',
  updated: '2026-05-16',
  sections: [
    {
      heading: 'What we collect',
      body: `When you use Moka, you may upload image or video files for processing. These files are stored temporarily on our server solely to generate your mockup export. They are automatically deleted shortly after processing and are never used for any other purpose.

We do not collect personal data, create user accounts, or use cookies for tracking. No analytics or third-party tracking scripts are loaded.`,
    },
    {
      heading: 'File uploads',
      body: `Uploaded files are processed server-side to render the final image or video. Files are stored in a temporary directory and purged after a short period. We do not share, sell, or retain your files.`,
    },
    {
      heading: 'Third-party services',
      body: `Moka loads fonts from Google Fonts (fonts.googleapis.com). Google may collect limited request metadata such as your IP address and browser version as part of this request. Please refer to Google's Privacy Policy for details.`,
    },
    {
      heading: 'Your rights',
      body: `Since we do not retain personal data, there is nothing to access, correct, or delete after your session ends. If you have concerns, you can reach out via the repository linked in the footer.`,
    },
    {
      heading: 'Changes',
      body: `This policy may be updated occasionally. The date at the top of this page reflects the latest revision.`,
    },
  ],
};

const TERMS = {
  title: 'Terms of Use',
  updated: '2026-05-16',
  sections: [
    {
      heading: 'Use of the service',
      body: `Moka is a free, open-source mockup generation tool. You may use it for personal and commercial projects. You are responsible for ensuring you have the rights to any content you upload.`,
    },
    {
      heading: 'Prohibited use',
      body: `You may not use Moka to process content that is illegal, harmful, or infringes the rights of others. We reserve the right to block access to the service if misuse is detected.`,
    },
    {
      heading: 'No warranty',
      body: `Moka is provided "as is" without any warranty of any kind. We do not guarantee uninterrupted availability, and we are not liable for any loss of data or damages arising from use of the service.`,
    },
    {
      heading: 'Intellectual property',
      body: `Moka's source code is open source (MIT license). The Moka name and design are the property of their creator. Your uploaded content remains yours — we claim no ownership over files you process through Moka.`,
    },
    {
      heading: 'Changes',
      body: `These terms may be updated at any time. Continued use of the service after changes constitutes acceptance of the new terms.`,
    },
  ],
};

interface Props {
  page: 'privacy' | 'terms' | null;
  onClose: () => void;
}

export function LegalModal({ page, onClose }: Props) {
  const doc = page === 'privacy' ? PRIVACY : page === 'terms' ? TERMS : null;

  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, onClose]);

  return (
    <AnimatePresence>
      {doc && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f0f0f', borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)',
              width: '100%', maxWidth: 560, maxHeight: '80vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e9e9e9' }}>{doc.title}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: '#444' }}>Last updated {doc.updated}</p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}>×</button>
            </div>

            {/* Content */}
            <div style={{ overflowY: 'auto', padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {doc.sections.map((s) => (
                <div key={s.heading}>
                  <h3 style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: ACCENT }}>{s.heading}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#888', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{s.body}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
