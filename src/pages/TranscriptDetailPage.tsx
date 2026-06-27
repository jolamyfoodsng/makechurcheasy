import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import jsPDF from 'jspdf';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Church,
  Clock,
  Copy,
  Download,
  Edit2,
  FileCode,
  FileText,
  Globe,
  Info,
  Languages,
  Search,
  ShieldCheck,
  Timer,
  X,
  Zap
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LanguagePicker from '../components/LanguagePicker';
import languageData from '../../full_langugae_list.json';
import { checkPremiumAccess, getPremiumAccessDeniedMessage } from '../services/premiumActionGuard';
import { useLicenseGuardState } from '../services/licenseGuard';
import { useAuth } from '../contexts/AuthContext';
import { calculateTranslationCredits, countWords, deductCreditsWithSync, fetchCreditsFromBackend, isProUnlocked } from '../services/credits';
import { trackTranscriptExported } from '../services/tracking';
import { translateTranscript } from '../services/translationService';
import { addTranslationToTranscript, loadTranscripts, saveTranscript } from '../transcripts/transcriptService';
import type { Transcript, TranscriptScripture } from '../transcripts/transcriptTypes';
import './TranscriptDetailPage.css';

/* ── Helpers ── */

interface ParsedLine {
  time: string;
  text: string;
  highlight?: { type: string; text: string };
}

function parseTranscriptLines(raw: string): ParsedLine[] {
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line, i) => {
    const tabIdx = line.indexOf('\t');
    if (tabIdx > 0 && /^\d{2}:\d{2}:\d{2}$/.test(line.substring(0, tabIdx))) {
      return { time: line.substring(0, tabIdx), text: line.substring(tabIdx + 1) };
    }
    return { time: formatTimeFallback(i * 5), text: line };
  });
}

function formatTimeFallback(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SCRIPTURE_COLORS = ['yellow', 'green', 'blue', 'purple', 'red', 'cyan', 'pink', 'orange'];

interface DetectedScripture {
  id: number;
  ref: string;
  time: string;
  text: string;
  color: string;
}

function mapScriptures(
  scriptures: TranscriptScripture[],
  lines: ParsedLine[],
): DetectedScripture[] {
  return scriptures.map((s, i) => {
    // Find the line that contains the start of this verse
    let time = '00:00:00';
    if (s.verseText) {
      const prefix = s.verseText.substring(0, 30);
      const idx = lines.findIndex(l => l.text.includes(prefix));
      if (idx >= 0) time = lines[idx].time;
    }
    return {
      id: i + 1,
      ref: s.reference,
      time,
      text: s.verseText,
      color: SCRIPTURE_COLORS[i % SCRIPTURE_COLORS.length],
    };
  });
}

function assignHighlights(
  lines: ParsedLine[],
  scriptures: TranscriptScripture[],
): ParsedLine[] {
  return lines.map(line => {
    for (let i = 0; i < scriptures.length; i++) {
      const verse = scriptures[i].verseText;
      if (!verse) continue;
      // Try matching a meaningful prefix of the verse in the line
      for (let len = Math.min(verse.length, 60); len >= 20; len -= 10) {
        const snippet = verse.substring(0, len);
        if (line.text.includes(snippet)) {
          return { ...line, highlight: { type: SCRIPTURE_COLORS[i % SCRIPTURE_COLORS.length], text: snippet } };
        }
      }
    }
    return line;
  });
}

function formatDurationLabel(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }
  return `${sec}s`;
}

/* ── Export Helpers ── */

function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Transcript';
}

async function saveViaTauriDialog(defaultName: string, bytes: Uint8Array, filterName: string, extensions: string[]): Promise<boolean> {
  try {
    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions }],
    });
    if (!filePath) return false;
    await writeFile(filePath, bytes);
    return true;
  } catch (err) {
    console.error('[Export] saveViaTauriDialog error:', err);
    throw err;
  }
}

async function exportPDF(
  transcript: Transcript,
  lines: ParsedLine[],
  scriptures: DetectedScripture[],
): Promise<Uint8Array> {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(transcript.title, maxW);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 4;

  // Metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const meta: string[] = [];
  if (transcript.church) meta.push(transcript.church);
  meta.push(new Date(transcript.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  meta.push(formatDurationLabel(transcript.durationSeconds));
  meta.push(transcript.language);
  doc.text(meta.join('  ·  '), margin, y);
  y += 10;
  doc.setTextColor(0, 0, 0);

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // Transcript heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Transcript', margin, y);
  y += 8;

  // Transcript lines
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const line of lines) {
    const full = `${line.time}    ${line.text}`;
    const wrapped = doc.splitTextToSize(full, maxW);
    checkPage(wrapped.length * 4.2 + 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.2 + 1.5;
  }

  // Scriptures section
  if (scriptures.length > 0) {
    y += 8;
    checkPage(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Detected Scriptures', margin, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const s of scriptures) {
      const line = `${s.ref}  —  ${s.text}`;
      const wrapped = doc.splitTextToSize(line, maxW);
      checkPage(wrapped.length * 4.2 + 3);
      doc.setFont('helvetica', 'bold');
      doc.text(wrapped[0], margin, y);
      if (wrapped.length > 1) {
        doc.setFont('helvetica', 'normal');
        doc.text(wrapped.slice(1), margin, y + 4);
        y += wrapped.length * 4.2;
      } else {
        y += 5;
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text(s.time, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 5;
    }
  }

  const arrayBuf = doc.output('arraybuffer');
  return new Uint8Array(arrayBuf);
}

async function exportDOCX(
  transcript: Transcript,
  lines: ParsedLine[],
  scriptures: DetectedScripture[],
): Promise<Uint8Array> {
  const children: Paragraph[] = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: transcript.title, bold: true, size: 32, font: 'Calibri' })],
    spacing: { after: 200 },
  }));

  // Metadata
  const meta: string[] = [];
  if (transcript.church) meta.push(transcript.church);
  meta.push(new Date(transcript.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  meta.push(formatDurationLabel(transcript.durationSeconds));
  meta.push(transcript.language);
  children.push(new Paragraph({
    children: [new TextRun({ text: meta.join('  ·  '), size: 18, color: '888888', font: 'Calibri' })],
    spacing: { after: 300 },
  }));

  // Divider
  children.push(new Paragraph({
    children: [new TextRun({ text: '' })],
    spacing: { after: 200 },
    border: { bottom: { style: 'single' as const, size: 1, color: 'DDDDDD', space: 1 } },
  }));

  // Transcript heading
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Transcript', bold: true, size: 26, font: 'Calibri' })],
    spacing: { before: 200, after: 150 },
  }));

  // Transcript lines
  for (const line of lines) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${line.time}    `, font: 'Courier New', size: 18, color: '6D7CFF' }),
        new TextRun({ text: line.text, size: 20, font: 'Calibri' }),
      ],
      spacing: { after: 60 },
    }));
  }

  // Scriptures section
  if (scriptures.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Detected Scriptures', bold: true, size: 26, font: 'Calibri' })],
      spacing: { before: 400, after: 150 },
    }));
    for (const s of scriptures) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: s.ref, bold: true, size: 20, font: 'Calibri' }),
          new TextRun({ text: `  —  ${s.text}`, size: 20, font: 'Calibri' }),
        ],
        spacing: { after: 40 },
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: s.time, size: 16, color: '888888', font: 'Courier New' })],
        spacing: { after: 100 },
      }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

function copyTranscriptText(lines: ParsedLine[]): string {
  return lines.map(l => `${l.time}    ${l.text}`).join('\n');
}

/* ── AccessDeniedDialog ── */

interface AccessDeniedDialogProps {
  isOpen: boolean;
  reason: string;
  onClose: () => void;
}

function AccessDeniedDialog({ isOpen, reason, onClose }: AccessDeniedDialogProps) {
  const msg = getPremiumAccessDeniedMessage(reason);
  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={20} color="var(--error)" />
            <h2 className="modal-title">{msg.title}</h2>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{msg.description}</p>
        </div>
        <div className="modal-footer" style={{ gap: 8 }}>
          {msg.action === 'upgrade' && (
            <button className="btn btn-primary btn-block" onClick={onClose}>
              <Zap size={16} /> Upgrade Plan
            </button>
          )}
          {msg.action === 'reconnect' && (
            <button className="btn btn-primary btn-block" onClick={onClose}>
              <Search size={16} /> Check Connection
            </button>
          )}
          {msg.action === 'contact' && (
            <button className="btn btn-primary btn-block" onClick={onClose}>
              <Info size={16} /> Contact Support
            </button>
          )}
          <button className="btn btn-outline btn-block" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── TranslationModal ── */

interface TranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (language: string) => void;
  onBeforeStart?: () => Promise<boolean>;
  savedTranslations: { language: string; createdAt: string }[];
  transcriptTitle: string;
  transcriptText: string;
  userId?: string;
}

const languageLookup = new Map(
  (languageData as { code: string; name: string }[]).map(l => [l.code, l.name]),
);

function TranslationModal({ isOpen, onClose, onStart, onBeforeStart, savedTranslations, transcriptTitle, transcriptText, userId }: TranslationModalProps) {
  const [targetLanguage, setTargetLanguage] = useState('yo');
  const [transOption, setTransOption] = useState<'full' | 'detected'>('full');
  const [estimatedCredits, setEstimatedCredits] = useState(0);
  const [availableCredits, setAvailableCredits] = useState(0);
  const [verifyingAccess, setVerifyingAccess] = useState(false);
  const pro = isProUnlocked();
  const wordCount = countWords(transcriptText);
  useEffect(() => {
    calculateTranslationCredits(wordCount).then(setEstimatedCredits);
  }, [wordCount]);
  // Fetch credits from backend — never from localStorage
  useEffect(() => {
    if (!userId || pro) return;
    fetchCreditsFromBackend().then((credits) => {
      if (credits >= 0) setAvailableCredits(credits);
    });
  }, [userId, pro]);
  const canAfford = pro || availableCredits >= estimatedCredits;
  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`}>
      <div className="modal-panel">

        <div className="modal-header">
          <h2 className="modal-title">Translate Transcript</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-desc">Translate your transcript to another language.</p>

          {/* Step 1 */}
          <div>
            <div className="step-label">
              <span className="step-num">1</span>
              Select Language
            </div>

            <LanguagePicker value={targetLanguage} onChange={setTargetLanguage} />
          </div>

          {/* Step 2 */}
          <div>
            <div className="step-label">
              <span className="step-num">2</span>
              Translation Options
            </div>

            <div className="radio-group">
              <div
                className={`radio-card ${transOption === 'full' ? 'active' : ''}`}
                onClick={() => setTransOption('full')}
              >
                <div className="custom-radio"></div>
                <div>
                  <div className="rc-title">Translate full transcript</div>
                  <div className="rc-desc">Translate the entire transcript</div>
                </div>
              </div>

              <div
                className={`radio-card ${transOption === 'detected' ? 'active' : ''}`}
                onClick={() => setTransOption('detected')}
              >
                <div className="custom-radio"></div>
                <div>
                  <div className="rc-title">Translate detected scriptures only</div>
                  <div className="rc-desc">Translate only the scripture references</div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          {/* Credit estimate */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '12px 16px', background: 'var(--app-surface)', borderRadius: 6,
            border: '1px solid var(--app-border)', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Word Count</span>
              <span style={{ fontWeight: 600 }}>{wordCount.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Estimated Cost</span>
              <span style={{ fontWeight: 600, color: 'var(--gold)' }}>
                <Zap size={12} style={{ verticalAlign: -1, marginRight: 3 }} />
                {pro ? 'Free (Pro)' : `${estimatedCredits} credit${estimatedCredits !== 1 ? 's' : ''}`}
              </span>
            </div>
            {!pro && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Available Credits</span>
                <span style={{ fontWeight: 600, color: availableCredits >= estimatedCredits ? 'var(--green)' : 'var(--error)' }}>
                  {availableCredits}
                </span>
              </div>
            )}
          </div>

          {!canAfford && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6,
              marginBottom: 12, fontSize: 13, color: 'var(--error)',
            }}>
              <Info size={14} />
              <span>Not enough credits. Required: {estimatedCredits} — Available: {availableCredits}</span>
            </div>
          )}

          <button
            className="btn btn-primary btn-block"
            onClick={async () => {
              if (onBeforeStart) {
                setVerifyingAccess(true);
                try {
                  const allowed = await onBeforeStart();
                  if (!allowed) {
                    setVerifyingAccess(false);
                    return;
                  }
                } catch {
                  setVerifyingAccess(false);
                  return;
                }
                setVerifyingAccess(false);
              }
              onStart(languageLookup.get(targetLanguage) || targetLanguage);
            }}
            disabled={!canAfford || verifyingAccess}
            style={!canAfford || verifyingAccess ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            {verifyingAccess ? (
              <><div className="btn-spinner" /> Verifying access...</>
            ) : (
              <><Globe size={18} /> {canAfford ? 'Start Translation' : 'Insufficient Credits'}</>
            )}
          </button>

          {!pro && (
            <button
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={() => {
                // Placeholder for future payment integration
                alert('Credit purchase coming soon!');
              }}
            >
              <Zap size={16} /> Buy Credits
            </button>
          )}



          {savedTranslations.length > 0 && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--app-border)', paddingTop: '24px' }}>
              <h3 className="section-title" style={{ marginBottom: '16px' }}>Saved Translations</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {savedTranslations.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="rc-title">{transcriptTitle} → {t.language}</div>
                      <div className="rc-desc">{new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

/* ── TranslationView ── */

interface TranslationViewProps {
  onBack: () => void;
  lines: ParsedLine[];
  transcript: Transcript;
  transcriptText: string;
  targetLanguage: string;
  onComplete: (translatedText: string) => void;
}

function TranslationView({ onBack, lines, transcript, transcriptText, targetLanguage, onComplete }: TranslationViewProps) {
  const [progress, setProgress] = useState(0);
  const [translatedText, setTranslatedText] = useState('');
  const [error, setError] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [downloadState, setDownloadState] = useState<'idle' | 'pdf' | 'docx' | 'done_pdf' | 'done_docx'>('idle');

  // Simulated progress while waiting for API
  useEffect(() => {
    if (progress >= 100 || translatedText || error) return;
    const timer = setTimeout(() => {
      setProgress(p => {
        if (p < 90) return p + Math.random() * 3 + 0.5;
        if (p < 95) return p + 0.2;
        return p;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [progress, translatedText, error]);

  // Call translation API on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await translateTranscript(transcriptText, targetLanguage);
        if (cancelled) return;
        setTranslatedText(result.translatedText);
        setProgress(100);
        onComplete(result.translatedText);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message
          : typeof err === 'string' ? err
            : JSON.stringify(err);
        setError(msg || 'Translation failed');
        setProgress(0);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(async () => {
    setError('');
    setProgress(0);
    setIsRetrying(true);
    try {
      const result = await translateTranscript(transcriptText, targetLanguage);
      setTranslatedText(result.translatedText);
      setProgress(100);
      onComplete(result.translatedText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : typeof err === 'string' ? err
          : JSON.stringify(err);
      setError(msg || 'Translation failed');
      setProgress(0);
    } finally {
      setIsRetrying(false);
    }
  }, [transcriptText, targetLanguage, onComplete]);

  const translatedLines = translatedText
    ? translatedText.split('\n').filter(l => l.trim()).map(l => {
      const m = l.match(/^(\d{2}:\d{2}:\d{2})\s+(.*)$/);
      return m ? { time: m[1], text: m[2] } : { time: '', text: l };
    })
    : [];

  const isComplete = !!translatedText;
  const dashOffset = 283 - (283 * Math.min(progress, 100)) / 100;

  const handleDownload = (type: 'pdf' | 'docx') => {
    const exportLines = translatedLines.map((l, i) => ({
      time: l.time || lines[i]?.time || '',
      text: l.text,
    }));
    const translatedTranscript = { ...transcript, title: `${transcript.title} (${targetLanguage})`, transcriptText: translatedText };
    setDownloadState(type);
    setTimeout(() => {
      if (type === 'pdf') exportPDF(translatedTranscript, exportLines.map(l => ({ ...l, text: l.text })), []);
      else exportDOCX(translatedTranscript, exportLines.map(l => ({ ...l, text: l.text })), []);
      setDownloadState(`done_${type}` as 'done_pdf' | 'done_docx');
      setTimeout(() => setDownloadState('idle'), 2000);
    }, 500);
  };

  return (
    <div className="translation-view">
      <div className="t-header-row">
        <button className="back-link" onClick={onBack} style={{ marginBottom: 0 }}>
          <ArrowLeft size={16} /> Back to Transcript
        </button>
      </div>

      <h1 className="main-title" style={{ marginBottom: 24 }}>Translate Transcript</h1>

      {isComplete && (
        <div className="success-banner">
          <div className="success-icon-wrap">
            <CheckCircle2 size={32} />
          </div>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8, marginTop: 0 }}>Translation Complete</h3>
          <p style={{ color: 'var(--app-text-muted)' }}>Your transcript has been successfully translated to {targetLanguage}. Please review the text below.</p>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
          <p style={{ color: '#f87171', margin: 0, fontSize: '14px' }}>Translation failed: {error}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-outline" style={{ fontSize: '12px' }} onClick={onBack}>Go Back</button>
            <button className="btn btn-primary" style={{ fontSize: '12px' }} onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                  Retrying…
                </span>
              ) : 'Retry'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', flex: 1, overflow: 'hidden' }}>

        {/* Dual Panes */}
        <div className="two-pane-container" style={{ flex: 1, opacity: !isComplete ? 0.3 : 1, transition: '0.3s' }}>

          <div className="pane">
            <div className="pane-header">
              <span>Original (English)</span>
              <span style={{ fontSize: '10px', color: 'var(--app-text-muted)' }}>AUTO SCROLL OFF</span>
            </div>
            <div className="pane-content">
              {lines.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ width: 60, color: 'var(--app-text-accent)', fontSize: '12px', fontFamily: 'monospace' }}>{line.time}</div>
                  <div style={{ flex: 1, fontSize: '14px', color: 'var(--app-text-main)' }}>{line.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="pane" style={{ borderColor: isComplete ? 'var(--app-primary)' : 'var(--app-border)' }}>
            <div className="pane-header" style={{ background: isComplete ? 'rgba(79,70,229,0.1)' : '' }}>
              <span style={{ color: isComplete ? 'var(--app-text-accent)' : '' }}>Translation ({targetLanguage})</span>
              {isComplete && <Edit2 size={14} className="text-muted" />}
            </div>
            <div className="pane-content">
              {isComplete ? translatedLines.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ width: 60, color: 'var(--app-text-accent)', fontSize: '12px', fontFamily: 'monospace' }}>{line.time || lines[i]?.time}</div>
                  <div
                    className="editable-line"
                    style={{ flex: 1, fontSize: '14px', color: 'var(--app-text-main)' }}
                    contentEditable
                    suppressContentEditableWarning
                  >
                    {line.text}
                  </div>
                </div>
              )) : lines.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ width: 60, color: 'var(--app-text-accent)', fontSize: '12px', fontFamily: 'monospace' }}>{line.time}</div>
                  <div style={{ flex: 1, fontSize: '14px', color: 'var(--app-text-main)' }}>…</div>
                </div>
              ))}
            </div>
          </div>

          {!isComplete && !error && (
            <div className="progress-overlay">
              <div className="progress-card">
                <div className="circ-progress">
                  <svg viewBox="0 0 100 100" className="circ-svg">
                    <circle cx="50" cy="50" r="45" className="circ-bg" />
                    <circle cx="50" cy="50" r="45" className="circ-val" style={{ strokeDashoffset: dashOffset }} />
                  </svg>
                  <div className="circ-text">{progress}%</div>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8, marginTop: 0 }}>Translating to {targetLanguage}…</h2>
                <p style={{ color: 'var(--app-text-muted)', fontSize: '12px', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Estimated time remaining: 0m 12s
                </p>
                <button className="btn btn-outline" style={{ marginTop: 24, borderRadius: 24 }} onClick={() => setProgress(100)}>Cancel</button>
              </div>
            </div>
          )}

        </div>

        {/* Right Sidebar Stats */}
        <div className="t-stats-sidebar">
          <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 16, borderTop: isComplete ? '' : '4px solid var(--app-primary)' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {isComplete ? <ShieldCheck size={18} /> : <Timer size={18} />}
              {isComplete ? 'Translation Stats' : 'Translation Progress'}
            </h3>
            <div className="stat-row">
              <span className="stat-label">{!isComplete ? 'Status' : <><Timer size={16} /> Total Duration</>}</span>
              {!isComplete ? (
                <span className="brand-badge" style={{ backgroundColor: 'rgba(79,70,229,0.2)', color: 'var(--app-text-accent)', padding: '4px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--app-text-accent)' }}></div>
                  Translating
                </span>
              ) : (
                <span className="stat-val">{formatDurationLabel(lines.length * 5)}</span>
              )}
            </div>
            <div className="stat-row">
              <span className="stat-label">{!isComplete ? 'Total Duration' : <><Languages size={16} /> Translated</>}</span>
              <span className="stat-val">{formatDurationLabel(lines.length * 5)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">{!isComplete ? 'Translated Time' : <><Zap size={16} /> Speed</>}</span>
              <span className="stat-val" style={{ color: !isComplete ? 'var(--app-text-accent)' : '' }}>
                {!isComplete ? '01:11:38' : '~2.3x real-time'}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">{!isComplete ? 'Speed' : <><Info size={16} /> Status</>}</span>
              {!isComplete ? (
                <span className="stat-val">2.3x Real-time</span>
              ) : (
                <span className="stat-val" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#34d399', boxShadow: '0 0 8px #34d399' }}></div>
                  Completed
                </span>
              )}
            </div>
          </div>

          {isComplete ? (
            <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, marginBottom: 8 }}>Export Options</h3>
              <button
                className={`btn ${downloadState === 'done_pdf' ? 'btn-outline' : 'btn-primary'}`}
                style={{
                  display: 'flex', justifyContent: 'center', transition: 'all 0.3s',
                  backgroundColor: downloadState === 'done_pdf' ? 'rgba(16, 185, 129, 0.1)' : undefined,
                  borderColor: downloadState === 'done_pdf' ? 'rgba(16, 185, 129, 0.3)' : undefined,
                  color: downloadState === 'done_pdf' ? '#34d399' : undefined
                }}
                onClick={() => handleDownload('pdf')}
                disabled={downloadState !== 'idle'}
              >
                {downloadState === 'pdf' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Downloading…
                  </span>
                ) : downloadState === 'done_pdf' ? (
                  <><CheckCircle2 size={18} /> Downloaded</>
                ) : (
                  <><FileText size={18} /> Download PDF</>
                )}
              </button>
              <button
                className="btn btn-outline"
                style={{
                  display: 'flex', justifyContent: 'center', transition: 'all 0.3s',
                  backgroundColor: downloadState === 'done_docx' ? 'rgba(16, 185, 129, 0.1)' : undefined,
                  borderColor: downloadState === 'done_docx' ? 'rgba(16, 185, 129, 0.3)' : undefined,
                  color: downloadState === 'done_docx' ? '#34d399' : undefined
                }}
                onClick={() => handleDownload('docx')}
                disabled={downloadState !== 'idle'}
              >
                {downloadState === 'docx' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Downloading…
                  </span>
                ) : downloadState === 'done_docx' ? (
                  <><CheckCircle2 size={18} /> Downloaded</>
                ) : (
                  <><FileCode size={18} /> Download Word (DOCX)</>
                )}
              </button>

            </div>
          ) : (
            <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>Translation Settings</h3>

              <div>
                <span className="stat-label" style={{ marginBottom: 4 }}>Target Language</span>
                <div style={{ background: 'var(--app-surface-variant)', padding: '8px 12px', borderRadius: 4, fontSize: '14px' }}>{targetLanguage}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */

interface TranscriptDetailProps {
  transcriptId: string;
  onBack: () => void;
}

export default function TranscriptDetailPage({ transcriptId, onBack }: TranscriptDetailProps) {
  const { user } = useAuth();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'idle' | 'pdf' | 'docx' | 'done_pdf' | 'done_docx'>('idle');
  const [copyState, setCopyState] = useState<'idle' | 'done'>('idle');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [translationExporting, setTranslationExporting] = useState<Record<string, 'idle' | 'pdf' | 'docx' | 'done_pdf' | 'done_docx'>>({});
  const [isTranslateOpen, setIsTranslateOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'scriptures' | 'translations'>('scriptures');
  const [accessDeniedDialog, setAccessDeniedDialog] = useState<{ open: boolean; reason: string }>({ open: false, reason: '' });
  const isLicenseUnlocked = useLicenseGuardState();

  // Runtime license change: cancel in-progress work if license revoked
  const isTranslatingRef = useRef(isTranslating);
  isTranslatingRef.current = isTranslating;

  useEffect(() => {
    if (!isLicenseUnlocked && isTranslatingRef.current) {
      setIsTranslating(false);
    }
  }, [isLicenseUnlocked]);

  useEffect(() => {
    loadTranscripts()
      .then(all => {
        setTranscript(all.find(t => t.id === transcriptId) ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [transcriptId]);

  const parsedLines = useMemo(
    () => transcript ? parseTranscriptLines(transcript.transcriptText) : [],
    [transcript],
  );

  const displayLines = useMemo(
    () => transcript ? assignHighlights(parsedLines, transcript.scriptures) : parsedLines,
    [parsedLines, transcript],
  );

  const detected = useMemo(
    () => transcript ? mapScriptures(transcript.scriptures, parsedLines) : [],
    [transcript, parsedLines],
  );

  const doExport = useCallback(async (type: 'pdf' | 'docx') => {
    if (!transcript || exporting !== 'idle') return;
    const access = await checkPremiumAccess('transcriptExport');
    if (!access.allowed) {
      setAccessDeniedDialog({ open: true, reason: access.reason || 'feature_not_available' });
      return;
    }
    setExporting(type);
    try {
      const filename = sanitizeFilename(transcript.title);
      let bytes: Uint8Array;
      if (type === 'pdf') {
        bytes = await exportPDF(transcript, displayLines, detected);
      } else {
        bytes = await exportDOCX(transcript, displayLines, detected);
      }
      const saved = type === 'pdf'
        ? await saveViaTauriDialog(`${filename}.pdf`, bytes, 'PDF', ['pdf'])
        : await saveViaTauriDialog(`${filename}.docx`, bytes, 'Word Document', ['docx']);
      if (saved) {
        setExporting(`done_${type}` as typeof exporting);
        trackTranscriptExported(type);
        setTimeout(() => setExporting('idle'), 2000);
      } else {
        setExporting('idle');
      }
    } catch (err) {
      console.error('[Export] failed:', err);
      setExporting('idle');
    }
  }, [transcript, displayLines, detected, exporting]);

  const doExportTranslation = useCallback(async (translationId: string, translatedText: string, language: string, type: 'pdf' | 'docx') => {
    if (!transcript) return;
    const access = await checkPremiumAccess('translationExport');
    if (!access.allowed) {
      setAccessDeniedDialog({ open: true, reason: access.reason || 'feature_not_available' });
      return;
    }
    const prev = translationExporting[translationId];
    if (prev && prev !== 'idle' && !prev.startsWith('done')) return;
    setTranslationExporting(prev => ({ ...prev, [translationId]: type }));
    try {
      const lines = translatedText.split('\n').filter(l => l.trim()).map(l => {
        const m = l.match(/^(\d{2}:\d{2}:\d{2})\s+(.*)$/);
        return { time: m?.[1] || '', text: m?.[2] || l };
      });
      const exportTranscript = { ...transcript, title: `${transcript.title} (${language})`, transcriptText: translatedText };
      const filename = sanitizeFilename(exportTranscript.title);
      let bytes: Uint8Array;
      if (type === 'pdf') {
        bytes = await exportPDF(exportTranscript, lines, []);
      } else {
        bytes = await exportDOCX(exportTranscript, lines, []);
      }
      const saved = type === 'pdf'
        ? await saveViaTauriDialog(`${filename}.pdf`, bytes, 'PDF', ['pdf'])
        : await saveViaTauriDialog(`${filename}.docx`, bytes, 'Word Document', ['docx']);
      if (saved) {
        setTranslationExporting(prev => ({ ...prev, [translationId]: `done_${type}` as any }));
        trackTranscriptExported(type);
        setTimeout(() => setTranslationExporting(prev => ({ ...prev, [translationId]: 'idle' })), 2000);
      } else {
        setTranslationExporting(prev => ({ ...prev, [translationId]: 'idle' }));
      }
    } catch (err) {
      console.error('[Export] translation export failed:', err);
      setTranslationExporting(prev => ({ ...prev, [translationId]: 'idle' }));
    }
  }, [transcript, translationExporting]);

  const handleCopy = useCallback(() => {
    if (copyState === 'done') return;
    const text = copyTranscriptText(displayLines);
    navigator.clipboard.writeText(text).then(() => {
      setCopyState('done');
      setTimeout(() => setCopyState('idle'), 2000);
    });
  }, [displayLines, copyState]);

  const renderHighlight = (text: string, highlight?: { type: string; text: string }) => {
    if (!highlight) return text;
    const parts = text.split(highlight.text);
    if (parts.length < 2) return text;
    return (
      <>
        {parts[0]}
        <span className={`hl-${highlight.type}`}>{highlight.text}</span>
        {parts.slice(1).join(highlight.text)}
      </>
    );
  };

  const getIconColorClass = (color: string) => {
    switch (color) {
      case 'yellow': return 'icon-yellow';
      case 'green': return 'icon-green';
      case 'blue': return 'icon-blue';
      case 'purple': return 'icon-purple';
      case 'red': return 'icon-yellow';
      default: return 'icon-yellow';
    }
  };

  /* ── Loading / Not-found states ── */

  if (loading) {
    return (
      <div className="detail-view">
        <div className="back-link" style={{ padding: 24, color: 'var(--app-text-muted)' }}>Loading transcript…</div>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="detail-view">
        <div style={{ padding: 24 }}>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={16} /> Back to Transcripts
          </button>
          <h2 className="main-title" style={{ marginTop: 24 }}>Transcript not found</h2>
          <p style={{ color: 'var(--app-text-muted)' }}>The transcript you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  /* ── Derived data ── */

  const createdDate = new Date(transcript.createdAt);
  const dateLabel = createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = createdDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const durationLabel = formatDurationLabel(transcript.durationSeconds);

  if (isTranslating && transcript) {
    return (
      <TranslationView
        onBack={() => setIsTranslating(false)}
        lines={displayLines}
        transcript={transcript}
        transcriptText={transcript.transcriptText}
        targetLanguage={targetLanguage}
        onComplete={(translatedText) => {
          const updated = addTranslationToTranscript(transcript, targetLanguage, translatedText);
          setTranscript(updated);
          saveTranscript(updated).catch(() => { });
          // Deduct translation credits (1 credit per 150 words) — synced to MongoDB
          void (async () => {
            try {
              const creditsNeeded = await calculateTranslationCredits(countWords(transcript.transcriptText));
              if (creditsNeeded > 0 && user?.id) {
                const ok = await deductCreditsWithSync(user.id, creditsNeeded, "translation", `Translation to ${targetLanguage}: ${countWords(transcript.transcriptText)} words`);
                if (!ok) {
                  console.warn("[Credits] Translation completed but credit deduction failed — check backend");
                }
              }
            } catch (err) {
              console.warn("[Credits] Translation credit deduction error:", err);
            }
          })();
        }}
      />
    );
  }

  return (
    <div className="detail-view">
      {/* Header Section */}
      <div className="detail-header-section">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Transcripts
        </button>

        <div className="detail-title-row">
          <div className="title-left">
            <div className="title-flex">
              <h1 className="main-title">{transcript.title}</h1>
              <button className="edit-btn"><Edit2 size={12} /></button>
            </div>
            <div className="meta-row">
              {transcript.church && <div className="meta-item"><Church size={14} /> {transcript.church}</div>}
              <div className="meta-item"><Calendar size={14} /> {dateLabel}</div>
              <div className="meta-item"><Clock size={14} /> {timeLabel}</div>
              <div className="meta-item"><Timer size={14} /> {durationLabel}</div>
              <div className="meta-item">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></div>
                {transcript.language}
              </div>
            </div>
          </div>

          <div className="title-actions">
            <div className="btn-export" style={{ position: 'relative' }}>
              <button
                className="btn-export-main"
                style={{
                  transition: 'all 0.3s',
                  backgroundColor: (exporting === 'done_pdf' || exporting === 'done_docx') ? 'rgba(16, 185, 129, 0.1)' : undefined,
                  color: (exporting === 'done_pdf' || exporting === 'done_docx') ? '#34d399' : undefined
                }}
                onClick={() => {
                  if (exporting !== 'idle') return;
                  setShowExportMenu(!showExportMenu);
                }}
                disabled={exporting !== 'idle' && !exporting.startsWith('done')}
              >
                {exporting !== 'idle' && !exporting.startsWith('done') ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Saving…
                  </span>
                ) : exporting === 'done_pdf' || exporting === 'done_docx' ? (
                  <><CheckCircle2 size={16} /> Exported</>
                ) : (
                  <><Download size={16} /> Export <ChevronDown size={14} style={{ marginLeft: 2, opacity: 0.6 }} /></>
                )}
              </button>
              {showExportMenu && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="export-popover">
                    <button
                      className="export-popover-item"
                      onClick={() => { setShowExportMenu(false); doExport('pdf'); }}
                    >
                      <FileText size={15} />
                      <span>Export as PDF</span>
                    </button>
                    <div className="export-popover-divider" />
                    <button
                      className="export-popover-item"
                      onClick={() => { setShowExportMenu(false); doExport('docx'); }}
                    >
                      <FileCode size={15} />
                      <span>Export as DOCX</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="btn btn-outline" onClick={async () => {
              const access = await checkPremiumAccess('translation');
              if (!access.allowed) {
                setAccessDeniedDialog({ open: true, reason: access.reason || 'feature_not_available' });
                return;
              }
              setIsTranslateOpen(true);
            }} style={{ padding: '8px 16px', color: '#adc7ff', borderColor: 'rgba(173,199,255,0.3)' }}>
              <Languages size={16} /> Translate
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="detail-tabs">
          <button className="tab-btn active">Transcript</button>
          <button className="tab-btn">Summary <span className="beta-tag">BETA</span></button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="detail-content">

        {/* Left/Center Transcript Panel */}
        <div className="transcript-panel">
          <div className="transcript-toolbar">
            <div className="search-input-wrapper">
              <Search className="search-icon" size={16} />
              <input type="text" className="search-input" placeholder="Search in transcript…" />
            </div>
            <div className="toolbar-actions">
              <button
                className="btn-icon-only"
                style={{
                  background: 'var(--app-surface)', border: '1px solid var(--app-border)',
                  color: copyState === 'done' ? '#34d399' : undefined
                }}
                onClick={handleCopy}
              >
                {copyState === 'done' ? <CheckCircle2 size={16} color="#34d399" /> : <Copy size={16} className="text-muted" />}
              </button>
            </div>
          </div>

          <div className="transcript-scroll">
            {displayLines.map((line, i) => (
              <div key={i} className={`t-line-wrapper ${line.highlight ? 'has-highlight' : ''}`}
                style={line.highlight ? { borderLeftColor: `var(--hl-${line.highlight.type})` } : {}}>
                <div className="t-timestamp">{line.time}</div>
                <div className="t-content">
                  {renderHighlight(line.text, line.highlight)}
                </div>
              </div>
            ))}
            <div style={{ height: '80px' }}></div>
          </div>


        </div>

        {/* Right Sidebar - Scriptures & Translations */}
        <div className="right-sidebar">
          {/* Sidebar Tabs */}
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${sidebarTab === 'scriptures' ? 'active' : ''}`}
              onClick={() => setSidebarTab('scriptures')}
            >
              <BookOpen size={14} />
              Scriptures
              {detected.length > 0 && (
                <span className="tab-count">{detected.length}</span>
              )}
            </button>
            <button
              className={`sidebar-tab ${sidebarTab === 'translations' ? 'active' : ''}`}
              onClick={() => setSidebarTab('translations')}
            >
              <Languages size={14} />
              Translations
              {transcript.translations.length > 0 && (
                <span className="tab-count">{transcript.translations.length}</span>
              )}
            </button>
          </div>

          {/* Scriptures Tab */}
          {sidebarTab === 'scriptures' && (
            <div className="sidebar-tab-content">
              <div className="scripture-cards">
                {detected.map((scrip) => (
                  <div key={scrip.id} className="s-card">
                    <div className="s-card-header">
                      <div className="s-card-title-group">
                        <div className={`s-icon ${getIconColorClass(scrip.color)}`}>
                          <BookOpen size={16} />
                        </div>
                        <div className="s-title">{scrip.ref}</div>
                      </div>
                      <div className="s-actions">
                        <ArrowUpRight size={14} className="s-action-icon" />
                        <Copy size={14} className="s-action-icon" />
                      </div>
                    </div>
                    <div className="s-text">{scrip.text}</div>
                    <div className="s-time">{scrip.time}</div>
                  </div>
                ))}
                {detected.length === 0 && (
                  <div className="sidebar-empty-state">
                    <BookOpen size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <p>No scriptures detected in this transcript.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Translations Tab */}
          {sidebarTab === 'translations' && (
            <div className="sidebar-tab-content">
              <div className="translation-cards">
                {transcript.translations.map((t) => {
                  const expState = translationExporting[t.id] || 'idle';
                  const isExporting = expState !== 'idle' && !expState.startsWith('done');
                  return (
                    <div key={t.id} className="translation-card">
                      <div className="translation-card-header">
                        <div className="translation-lang">
                          <Languages size={14} />
                          <span>{t.language}</span>
                        </div>
                        <div className="translation-date">
                          {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <div className="translation-preview">
                        {t.translatedText.substring(0, 150)}...
                      </div>
                      <div className="translation-actions">
                        <button
                          className="btn-icon-small"
                          title="View translation"
                        >
                          <ArrowUpRight size={12} />
                        </button>
                        <button
                          className="btn-icon-small"
                          title="Copy translation"
                          onClick={async () => {
                            const access = await checkPremiumAccess('translationExport');
                            if (!access.allowed) {
                              setAccessDeniedDialog({ open: true, reason: access.reason || 'feature_not_available' });
                              return;
                            }
                            navigator.clipboard.writeText(t.translatedText);
                          }}
                        >
                          <Copy size={12} />
                        </button>
                        <div className="translation-export-group">
                          <button
                            className={`btn-icon-small ${expState === 'done_pdf' ? 'export-success' : ''}`}
                            title="Export as PDF"
                            disabled={isExporting}
                            onClick={() => doExportTranslation(t.id, t.translatedText, t.language, 'pdf')}
                          >
                            {isExporting && expState === 'pdf' ? (
                              <div className="btn-spinner" />
                            ) : expState === 'done_pdf' ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <FileText size={12} />
                            )}
                          </button>
                          <button
                            className={`btn-icon-small ${expState === 'done_docx' ? 'export-success' : ''}`}
                            title="Export as Word"
                            disabled={isExporting}
                            onClick={() => doExportTranslation(t.id, t.translatedText, t.language, 'docx')}
                          >
                            {isExporting && expState === 'docx' ? (
                              <div className="btn-spinner" />
                            ) : expState === 'done_docx' ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <FileCode size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {transcript.translations.length === 0 && (
                  <div className="sidebar-empty-state">
                    <Languages size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <p>No translations yet.</p>
                    <button
                      className="btn btn-outline btn-small"
                      onClick={async () => {
                        const access = await checkPremiumAccess('translation');
                        if (!access.allowed) {
                          setAccessDeniedDialog({ open: true, reason: access.reason || 'feature_not_available' });
                          return;
                        }
                        setIsTranslateOpen(true);
                      }}
                    >
                      <Languages size={14} /> Add Translation
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      <TranslationModal
        isOpen={isTranslateOpen}
        onClose={() => setIsTranslateOpen(false)}
        onStart={(language) => {
          setTargetLanguage(language);
          setIsTranslateOpen(false);
          setIsTranslating(true);
        }}
        onBeforeStart={async () => {
          const wordCount = countWords(transcript?.transcriptText ?? '');
          const isPro = isProUnlocked();
          const credits = isPro ? 0 : Math.ceil(wordCount / 150);
          const access = await checkPremiumAccess('translation', { requiredCredits: credits });
          if (!access.allowed) {
            setAccessDeniedDialog({ open: true, reason: access.reason || 'feature_not_available' });
            return false;
          }
          return true;
        }}
        savedTranslations={transcript?.translations ?? []}
        transcriptTitle={transcript?.title ?? ''}
        transcriptText={transcript?.transcriptText ?? ''}
        userId={user?.id}
      />

      <AccessDeniedDialog
        isOpen={accessDeniedDialog.open}
        reason={accessDeniedDialog.reason}
        onClose={() => setAccessDeniedDialog({ open: false, reason: '' })}
      />

    </div>
  );
}
