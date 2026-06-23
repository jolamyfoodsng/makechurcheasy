import React, { useState } from 'react';
import { Music, Minus, Square, X, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Type, PaintBucket, MoreVertical, ChevronDown, Plus, Settings } from 'lucide-react';
import './OpenWorshipModal.css';

// --- Types ---
export interface Theme {
    id: string;
    name: string;
    bgClass: string;
    thumbClass: string;
    overlayStyle?: React.CSSProperties;
    thumbImg: string;
}

export interface SongMetadata {
    title: string;
    artist: string;
    note: string;
    author: string;
    copyright: string;
}

export interface TextFormatting {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    alignment: 'left' | 'center' | 'right';
}

// --- Themes Constants ---
export const THEMES: Theme[] = [
    {
        id: 'modern-gradient',
        name: 'Modern Gradient',
        bgClass: 'bg-modern-gradient',
        thumbClass: 'bg-modern-gradient-thumb',
        overlayStyle: { backgroundImage: 'url("https://placehold.co/800x450/1e1b4b/4c1d95?text=Wave+Pattern")', opacity: 0.5, mixBlendMode: 'overlay' as any },
        thumbImg: 'https://placehold.co/100x60/1e1b4b/4c1d95?text=+'
    },
    {
        id: 'ocean-blue',
        name: 'Ocean Blue',
        bgClass: 'bg-ocean-blue',
        thumbClass: 'bg-ocean-blue-thumb',
        overlayStyle: { backgroundImage: 'url("https://placehold.co/800x450/115e59/0f766e?text=Bokeh")', opacity: 0.4, mixBlendMode: 'overlay' as any },
        thumbImg: 'https://placehold.co/100x60/1e3a8a/3b82f6?text=+'
    },
    {
        id: 'sunset-glow',
        name: 'Sunset Glow',
        bgClass: 'bg-sunset-glow',
        thumbClass: 'bg-sunset-glow-thumb',
        overlayStyle: { backgroundImage: 'url("https://placehold.co/800x450/7c2d12/9a3412?text=Particles")', opacity: 0.5, mixBlendMode: 'overlay' as any },
        thumbImg: 'https://placehold.co/100x60/ea580c/f97316?text=+'
    },
    {
        id: 'purple-wave',
        name: 'Purple Wave',
        bgClass: 'bg-purple-wave',
        thumbClass: 'bg-purple-wave-thumb',
        overlayStyle: { backgroundImage: 'url("https://placehold.co/800x450/4c1d95/6d28d9?text=Abstract")', opacity: 0.4, mixBlendMode: 'overlay' as any },
        thumbImg: 'https://placehold.co/100x60/6b21a8/9333ea?text=+'
    },
    {
        id: 'dark-slate',
        name: 'Dark Slate',
        bgClass: 'bg-dark-slate',
        thumbClass: 'bg-dark-slate-thumb',
        thumbImg: 'https://placehold.co/100x60/1f2937/374151?text=+'
    },
    {
        id: 'soft-green',
        name: 'Soft Green',
        bgClass: 'bg-soft-green',
        thumbClass: 'bg-soft-green-thumb',
        thumbImg: 'https://placehold.co/100x60/bbf7d0/86efac?text=+'
    },
    {
        id: 'cloud-light',
        name: 'Cloud Light',
        bgClass: 'bg-cloud-light',
        thumbClass: 'bg-cloud-light-thumb',
        thumbImg: 'https://placehold.co/100x60/dbeafe/bfdbfe?text=+'
    }
];

// --- Sub-Components ---

function Header() {
    return (
        <header className="header">
            <div className="header-title-group">
                <div className="header-icon">
                    <Music size={12} />
                </div>
                Song
            </div>
            <div className="header-actions">
                <button className="header-btn"><Minus size={16} /></button>
                <button className="header-btn"><Square size={14} /></button>
                <button className="header-btn"><X size={16} /></button>
            </div>
        </header>
    );
}

interface SidebarProps {
    metadata: SongMetadata;
    setMetadata: React.Dispatch<React.SetStateAction<SongMetadata>>;
    formatting: TextFormatting;
    setFormatting: React.Dispatch<React.SetStateAction<TextFormatting>>;
    lyrics: string;
    setLyrics: (val: string) => void;
    autoSplit: boolean;
    setAutoSplit: (val: boolean) => void;
    linesPerSlide: number;
    setLinesPerSlide: (val: number) => void;
}

function Sidebar({ metadata, setMetadata, formatting, setFormatting, lyrics, setLyrics, autoSplit, setAutoSplit, linesPerSlide, setLinesPerSlide }: SidebarProps) {
    const lineCount = lyrics.split('\n').length;
    let slideCount = 0;
    if (autoSplit) {
        const allLines = lyrics.split('\n').filter(l => l.trim().length > 0);
        slideCount = Math.ceil(allLines.length / linesPerSlide);
    } else {
        slideCount = lyrics.split(/\n\s*\n/).filter(s => s.trim().length > 0).length;
    }

    const handleMetaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMetadata(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const toggleFormat = (key: keyof TextFormatting) => {
        setFormatting(prev => {
            if (key === 'alignment') return prev;
            return { ...prev, [key]: !prev[key as 'bold' | 'italic' | 'underline'] };
        });
    };

    return (
        <aside className="sidebar">
            <div className="toolbar">
                <button onClick={() => toggleFormat('bold')} className={`tool-btn ${formatting.bold ? 'active' : ''}`}><Bold size={16} /></button>
                <button onClick={() => toggleFormat('italic')} className={`tool-btn ${formatting.italic ? 'active' : ''}`}><Italic size={16} /></button>
                <button onClick={() => toggleFormat('underline')} className={`tool-btn ${formatting.underline ? 'active' : ''}`}><Underline size={16} /></button>
                <div className="tool-divider"></div>
                <button onClick={() => setFormatting(p => ({ ...p, alignment: 'left' }))} className={`tool-btn ${formatting.alignment === 'left' ? 'active' : ''}`}><AlignLeft size={16} /></button>
                <button onClick={() => setFormatting(p => ({ ...p, alignment: 'center' }))} className={`tool-btn ${formatting.alignment === 'center' ? 'active' : ''}`}><AlignCenter size={16} /></button>
                <button onClick={() => setFormatting(p => ({ ...p, alignment: 'right' }))} className={`tool-btn ${formatting.alignment === 'right' ? 'active' : ''}`}><AlignRight size={16} /></button>
                <div className="tool-divider"></div>
                <button className="tool-btn tool-text"><Type size={16} /></button>
                <button className="tool-btn"><PaintBucket size={16} /></button>
                <div className="tool-divider"></div>
                <button className="tool-btn"><MoreVertical size={16} /></button>
            </div>

            <div className="properties-form">
                <div>
                    <label className="form-group-label">Title</label>
                    <input name="title" value={metadata.title} onChange={handleMetaChange} className="form-input" type="text" />
                </div>
                <div>
                    <input name="artist" value={metadata.artist} onChange={handleMetaChange} className="form-input" placeholder="Artist" type="text" />
                </div>
                <div>
                    <input name="note" value={metadata.note} onChange={handleMetaChange} className="form-input" placeholder="Note" type="text" />
                </div>
                <div>
                    <input name="author" value={metadata.author} onChange={handleMetaChange} className="form-input" placeholder="Author" type="text" />
                </div>
                <div>
                    <input name="copyright" value={metadata.copyright} onChange={handleMetaChange} className="form-input" placeholder="Copyright" type="text" />
                </div>
                <button className="extra-btn">
                    <span>Extra</span>
                    <ChevronDown size={14} />
                </button>
            </div>

            <div className="auto-split-bar">
                <label className="auto-split-label">
                    <input
                        type="checkbox"
                        checked={autoSplit}
                        onChange={(e) => setAutoSplit(e.target.checked)}
                        className="auto-split-checkbox"
                    />
                    Auto-split slides
                </label>

                {autoSplit && (
                    <div className="auto-split-controls">
                        <span className="auto-split-lines-label">Lines:</span>
                        <input
                            type="number"
                            min="1"
                            max="20"
                            value={linesPerSlide}
                            onChange={(e) => setLinesPerSlide(Math.max(1, parseInt(e.target.value) || 1))}
                            className="auto-split-input"
                        />
                    </div>
                )}
            </div>

            <div className="editor-container">
                <textarea
                    className="editor-textarea"
                    placeholder="Enter lyrics here..."
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                />
            </div>

            <div className="sidebar-footer">
                <span>Total lines: {lineCount}</span>
                <span>•</span>
                <span>Estimated slides: {slideCount}</span>
            </div>
        </aside>
    );
}

interface PreviewSlideProps {
    lines: string[];
    theme: Theme;
    formatting: TextFormatting;
}

const PreviewSlide: React.FC<PreviewSlideProps> = ({ lines, theme, formatting }) => {
    let alignClass = 'slide-text-center';
    if (formatting.alignment === 'left') alignClass = 'slide-text-left';
    if (formatting.alignment === 'right') alignClass = 'slide-text-right';

    const fontClasses: string[] = [];
    if (formatting.bold) fontClasses.push('slide-text-bold');
    else fontClasses.push('slide-text-semibold');

    if (formatting.italic) fontClasses.push('slide-text-italic');
    if (formatting.underline) fontClasses.push('slide-text-underline');

    const isLightText = !theme.bgClass.includes('bg-soft-green') && !theme.bgClass.includes('bg-cloud-light');

    return (
        <div className={`slide-card ${theme.bgClass} ${alignClass} ${isLightText ? 'slide-text-light' : ''} ${fontClasses.join(' ')}`}>
            {theme.overlayStyle && (
                <div className="slide-overlay" style={theme.overlayStyle}></div>
            )}
            <div className="slide-content">
                {lines.map((line, i) => (
                    <p key={i}>{line}</p>
                ))}
            </div>
        </div>
    );
}

interface ThemesPanelProps {
    selectedThemeId: string;
    onSelectTheme: (id: string) => void;
}

function ThemesPanel({ selectedThemeId, onSelectTheme }: ThemesPanelProps) {
    return (
        <div className="themes-panel">
            <h3 className="themes-title">Themes</h3>
            <div className="themes-list">
                {THEMES.map((theme) => (
                    <div key={theme.id} className="theme-item" onClick={() => onSelectTheme(theme.id)}>
                        <div className={`theme-thumb ${selectedThemeId === theme.id ? 'active' : ''} ${theme.thumbClass}`}>
                            <div
                                className="theme-thumb-overlay"
                                style={{ backgroundImage: `url('${theme.thumbImg}')` }}
                            ></div>
                        </div>
                        <span className="theme-name">{theme.name}</span>
                    </div>
                ))}
            </div>

            <div className="themes-footer">
                <div className="theme-controls-group">
                    <button className="btn-outline">
                        <Plus size={14} /> Add Image
                    </button>
                    <button className="btn-icon">
                        <Settings size={16} />
                    </button>
                </div>
                <div className="theme-controls-group">
                    <button className="btn-icon-small"><Minus size={14} /></button>
                    <div className="zoom-slider">
                        <div className="zoom-thumb"></div>
                    </div>
                    <button className="btn-icon-small"><Plus size={14} /></button>
                    <button className="btn-outline">Fit</button>
                </div>
            </div>
        </div>
    );
}

// --- Main Initial State and App Root ---

const INITIAL_LYRICS = [
    "All the other gods",
    "They are the works of man",
    "But You are the Most High God",
    "There's none like You",
    "",
    "Jehovah You are the most high",
    "You are the most high God",
    "Jehovah, you are the most high!",
    "You are the most high God",
    "",
    "Jehovah You are the most high",
    "You are the most high God",
    "Jehovah, you are the most high!",
    "You are the most high God",
    "",
    "Ogo lati ma ga o",
    "Iyin lati ma ga o",
    "You are lifted high",
    "You are lifted high"
].join('\\n');

export default function OpenWorshipModal() {
    const [metadata, setMetadata] = useState<SongMetadata>({
        title: 'All the other Gods',
        artist: '',
        note: '',
        author: '',
        copyright: '',
    });

    const [formatting, setFormatting] = useState<TextFormatting>({
        bold: false,
        italic: false,
        underline: false,
        alignment: 'center',
    });

    const [lyrics, setLyrics] = useState(INITIAL_LYRICS);
    const [selectedThemeId, setSelectedThemeId] = useState('modern-gradient');
    const [autoSplit, setAutoSplit] = useState(false);
    const [linesPerSlide, setLinesPerSlide] = useState(4);

    const selectedTheme = THEMES.find(t => t.id === selectedThemeId) || THEMES[0];

    let slides: string[][] = [];
    if (autoSplit) {
        const allLines = lyrics.split('\\n').filter(l => l.trim().length > 0);
        for (let i = 0; i < allLines.length; i += linesPerSlide) {
            slides.push(allLines.slice(i, i + linesPerSlide));
        }
    } else {
        // Split lyrics by double newline (or more) into stanzas/slides
        const rawSlides = lyrics.split(/\\n\\s*\\n/).map(s => s.trim()).filter(s => s.length > 0);
        slides = rawSlides.map(slide => slide.split('\\n'));
    }

    return (
        <div className="app-container">
            <Header />

            <main className="main-content">
                <Sidebar
                    metadata={metadata}
                    setMetadata={setMetadata}
                    formatting={formatting}
                    setFormatting={setFormatting}
                    lyrics={lyrics}
                    setLyrics={setLyrics}
                    autoSplit={autoSplit}
                    setAutoSplit={setAutoSplit}
                    linesPerSlide={linesPerSlide}
                    setLinesPerSlide={setLinesPerSlide}
                />

                <section className="preview-section">
                    <div className="preview-scrollable">
                        <h2 className="preview-title">Preview</h2>
                        <div className="preview-grid">
                            {slides.map((lines, index) => (
                                <PreviewSlide
                                    key={index}
                                    lines={lines}
                                    theme={selectedTheme}
                                    formatting={formatting}
                                />
                            ))}
                        </div>
                        {slides.length === 0 && (
                            <div className="preview-empty">
                                <p>Type lyrics to see preview here</p>
                            </div>
                        )}
                    </div>

                    <ThemesPanel
                        selectedThemeId={selectedThemeId}
                        onSelectTheme={setSelectedThemeId}
                    />
                </section>
            </main>
        </div>
    );
}
