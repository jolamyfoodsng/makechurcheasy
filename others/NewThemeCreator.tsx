import { useState } from 'react';
import { defaultThemes, Theme, Category, LayoutType, FontWeight, AnimationType, Easing, BackgroundType, TextTransform, HorizontalAlignment, VerticalAlignment, GradientDirection, ImageFit } from './types';
import {
    Church, Undo, Redo, Copy, Trash2, Save, X, Plus, Search, Check, MoreHorizontal,
    ZoomIn, ZoomOut, Maximize, Monitor,
    Palette, Image as ImageIcon, MonitorPlay, Component, Square, PenTool,
    AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
    Star, Download, Upload, Play
} from 'lucide-react';

/* ─── Helpers ─── */

const fontVar = (font: string) => {
    if (font === 'Cormorant Garamond') return 'var(--font-serif)';
    if (font === 'Poppins') return 'var(--font-sans)';
    return 'var(--font-sans)';
};

const weightVal = (w: FontWeight): number => {
    const map: Record<FontWeight, number> = {
        'Light': 300,
        'Regular': 400,
        'Medium': 500,
        'Bold': 700,
        'Extra Bold': 800,
    };
    return map[w] ?? 400;
};

const textTransformCSS = (t: TextTransform): string => {
    if (t === 'Uppercase') return 'uppercase';
    if (t === 'Title Case') return 'capitalize';
    return 'none';
};

/* ─── Theme Card ─── */

interface ThemeCardProps {
    theme: Theme;
    isActive: boolean;
    onClick: () => void;
    onToggleFavorite: () => void;
    onMore: () => void;
}

function ThemeCard({ theme, isActive, onClick, onToggleFavorite, onMore }: ThemeCardProps) {
    return (
        <div
            onClick={onClick}
            className={`theme-card ${isActive ? 'active' : ''}`}
        >
            <div className="theme-card-thumb">
                <div style={{ backgroundImage: `url('${theme.background.image}')` }} />
            </div>
            <div className="theme-card-info">
                <span className="theme-card-title">{theme.name}</span>
                <div className="theme-card-meta">
                    <span className={`theme-card-category category-${theme.category.toLowerCase()}`}>
                        {theme.category}
                    </span>
                    <span className="theme-card-layout">{theme.layout}</span>
                </div>
            </div>
            <button
                className={`theme-card-fav ${theme.favorited ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            >
                <Star size={12} fill={theme.favorited ? 'currentColor' : 'none'} />
            </button>
            <button
                className="theme-card-more"
                onClick={(e) => { e.stopPropagation(); onMore(); }}
            >
                <MoreHorizontal size={14} />
            </button>
            {isActive && (
                <div className="theme-card-check">
                    <Check size={10} style={{ strokeWidth: 3 }} />
                </div>
            )}
        </div>
    );
}

/* ─── Left Panel: Theme Library ─── */

interface ThemeLibraryProps {
    themes: Theme[];
    activeThemeId: string;
    onSelectTheme: (id: string) => void;
    onCreateTheme: () => void;
    onToggleFavorite: (id: string) => void;
    onImport: () => void;
    onExport: () => void;
}

function ThemeLibrary({ themes, activeThemeId, onSelectTheme, onCreateTheme, onToggleFavorite, onImport, onExport }: ThemeLibraryProps) {
    const [search, setSearch] = useState('');
    const [layoutFilter, setLayoutFilter] = useState<'All' | LayoutType>('All');

    const filtered = themes.filter(t => {
        if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (layoutFilter !== 'All' && t.layout !== layoutFilter) return false;
        return true;
    });

    const fullscreenThemes = filtered.filter(t => t.layout === 'Fullscreen');
    const lowerThirdThemes = filtered.filter(t => t.layout === 'Lower Third');

    return (
        <aside className="theme-library">
            <div className="theme-library-header">
                <h2>Themes</h2>

                <div className="search-box">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search Themes..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="filter-tags">
                    {(['All', 'Fullscreen', 'Lower Third'] as const).map(tab => (
                        <button
                            key={tab}
                            className={`tag-btn ${layoutFilter === tab ? 'active' : ''}`}
                            onClick={() => setLayoutFilter(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="theme-list">
                {fullscreenThemes.length > 0 && (
                    <div>
                        <div className="theme-section-title">
                            <h3>Fullscreen Themes</h3>
                            <span>{fullscreenThemes.length}</span>
                        </div>
                        <div className="theme-card-container">
                            {fullscreenThemes.map(theme => (
                                <ThemeCard
                                    key={theme.id}
                                    theme={theme}
                                    isActive={activeThemeId === theme.id}
                                    onClick={() => onSelectTheme(theme.id)}
                                    onToggleFavorite={() => onToggleFavorite(theme.id)}
                                    onMore={() => { }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {lowerThirdThemes.length > 0 && (
                    <div>
                        <div className="theme-section-title">
                            <h3>Lower Third Themes</h3>
                            <span>{lowerThirdThemes.length}</span>
                        </div>
                        <div className="theme-card-container">
                            {lowerThirdThemes.map(theme => (
                                <ThemeCard
                                    key={theme.id}
                                    theme={theme}
                                    isActive={activeThemeId === theme.id}
                                    onClick={() => onSelectTheme(theme.id)}
                                    onToggleFavorite={() => onToggleFavorite(theme.id)}
                                    onMore={() => { }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {filtered.length === 0 && (
                    <div className="empty-state">
                        <p>No themes found</p>
                    </div>
                )}
            </div>

            <div className="theme-library-footer">
                <button onClick={onCreateTheme} className="btn-footer">
                    <Plus size={14} /> New Theme
                </button>
                <button onClick={onImport} className="btn-footer">
                    <Download size={14} /> Import Theme
                </button>
                <button onClick={onExport} className="btn-footer">
                    <Upload size={14} /> Export Theme
                </button>
            </div>
        </aside>
    );
}

/* ─── Center Panel: Live Preview ─── */

type ZoomLevel = 'Fit' | '50%' | '75%' | '100%' | '125%';

interface PreviewCanvasProps {
    theme: Theme;
}

function PreviewCanvas({ theme }: PreviewCanvasProps) {
    const [zoom, setZoom] = useState<ZoomLevel>('Fit');
    const [showSafeArea, setShowSafeArea] = useState(false);
    const [showGrid, setShowGrid] = useState(false);

    const zoomScale = zoom === 'Fit' ? 1 : zoom === '50%' ? 0.5 : zoom === '75%' ? 0.75 : zoom === '100%' ? 1 : 1.25;

    const buildBgStyle = (): React.CSSProperties => {
        const bg = theme.background;
        switch (bg.type) {
            case 'Solid Color':
                return { backgroundColor: bg.solidColor };
            case 'Gradient':
                const dir = bg.gradientDirection === 'Top to Bottom' ? 'to bottom'
                    : bg.gradientDirection === 'Bottom to Top' ? 'to top'
                        : bg.gradientDirection === 'Left to Right' ? 'to right'
                            : bg.gradientDirection === 'Right to Left' ? 'to left'
                                : 'to bottom right';
                return { background: `linear-gradient(${dir}, ${bg.gradientStart}, ${bg.gradientEnd})` };
            case 'Image':
                return {
                    backgroundImage: `url('${bg.image}')`,
                    backgroundSize: bg.imageFit === 'Fill' ? 'cover'
                        : bg.imageFit === 'Fit' ? 'contain'
                            : bg.imageFit === 'Tile' ? 'repeat'
                                : '100% 100%',
                    backgroundPosition: 'center',
                    filter: `brightness(${bg.brightness}%) blur(${bg.blur}px)`,
                };
            case 'Video':
                return { backgroundColor: '#000' };
            case 'Pattern':
                return { backgroundColor: bg.solidColor || '#1a1a2e' };
            case 'Transparent':
            default:
                return { backgroundColor: '#000' };
        }
    };

    const buildOverlayStyle = (): React.CSSProperties | null => {
        const bg = theme.background;
        if (bg.type === 'Image' || bg.type === 'Video') {
            return {
                backgroundColor: bg.overlayColor,
                opacity: bg.overlayOpacity / 100,
            };
        }
        return null;
    };

    let dummyText = null;

    if (theme.category === 'Bible') {
        dummyText = (
            <>
                {theme.bibleSettings.showReference && theme.bibleSettings.referencePosition === 'Above Verse' && (
                    <div
                        className="preview-dummy-ref"
                        style={{
                            color: theme.typography.referenceColor,
                            fontSize: `${theme.typography.referenceSize}px`,
                            fontFamily: fontVar(theme.typography.referenceFont),
                            fontWeight: weightVal(theme.typography.referenceWeight),
                        }}
                    >
                        Genesis 1:1 (NIV)
                    </div>
                )}
                <div
                    className="preview-dummy-text"
                    style={{
                        color: theme.typography.headingColor,
                        fontSize: `${theme.typography.headingSize}px`,
                        fontFamily: fontVar(theme.typography.headingFont),
                        fontWeight: weightVal(theme.typography.headingWeight),
                        textTransform: textTransformCSS(theme.typography.textTransform),
                        opacity: theme.typography.opacity / 100,
                        lineHeight: theme.typography.lineHeight,
                        letterSpacing: `${theme.typography.letterSpacing}px`,
                    }}
                >
                    In the beginning God<br />created the heavens<br />and the earth.
                </div>
                {theme.bibleSettings.showReference && theme.bibleSettings.referencePosition === 'Below Verse' && (
                    <div
                        className="preview-dummy-ref"
                        style={{
                            color: theme.typography.referenceColor,
                            fontSize: `${theme.typography.referenceSize}px`,
                            fontFamily: fontVar(theme.typography.referenceFont),
                            fontWeight: weightVal(theme.typography.referenceWeight),
                        }}
                    >
                        Genesis 1:1 (NIV)
                    </div>
                )}
            </>
        );
    } else if (theme.category === 'Worship') {
        dummyText = (
            <>
                {theme.worshipSettings.showSongTitle && theme.worshipSettings.songTitlePosition === 'Top' && (
                    <div
                        className="preview-dummy-song-title"
                        style={{
                            color: theme.typography.headingColor,
                            fontSize: `${theme.typography.headingSize}px`,
                            fontFamily: fontVar(theme.typography.headingFont),
                            fontWeight: weightVal(theme.typography.headingWeight),
                        }}
                    >
                        Amazing Grace
                    </div>
                )}
                <div
                    className="preview-dummy-text"
                    style={{
                        color: theme.typography.headingColor,
                        fontSize: `${theme.typography.headingSize}px`,
                        fontFamily: fontVar(theme.typography.headingFont),
                        fontWeight: weightVal(theme.typography.headingWeight),
                        textTransform: textTransformCSS(theme.typography.textTransform),
                        opacity: theme.typography.opacity / 100,
                        lineHeight: theme.typography.lineHeight,
                        letterSpacing: `${theme.typography.letterSpacing}px`,
                    }}
                >
                    How sweet the sound<br />
                    That saved a wretch<br />
                    like me
                </div>
                {theme.worshipSettings.showChorusLabel && (
                    <div className="preview-dummy-label" style={{ color: theme.typography.referenceColor }}>
                        <div className="divider" style={{ height: '1px', width: '32px', backgroundColor: 'currentColor', opacity: 0.5 }} />
                        {theme.worshipSettings.labelStyle}
                        <div className="divider" style={{ height: '1px', width: '32px', backgroundColor: 'currentColor', opacity: 0.5 }} />
                    </div>
                )}
                {theme.worshipSettings.showSongTitle && theme.worshipSettings.songTitlePosition === 'Bottom' && (
                    <div
                        className="preview-dummy-song-title"
                        style={{
                            color: theme.typography.headingColor,
                            fontSize: `${theme.typography.headingSize * 0.5}px`,
                            fontFamily: fontVar(theme.typography.headingFont),
                            fontWeight: weightVal(theme.typography.headingWeight),
                            marginTop: '24px',
                        }}
                    >
                        Amazing Grace
                    </div>
                )}
            </>
        );
    } else {
        dummyText = (
            <div
                className="preview-dummy-text"
                style={{
                    color: theme.typography.headingColor,
                    fontSize: `${theme.typography.headingSize}px`,
                    fontFamily: fontVar(theme.typography.headingFont),
                    fontWeight: weightVal(theme.typography.headingWeight),
                    textTransform: textTransformCSS(theme.typography.textTransform),
                    opacity: theme.typography.opacity / 100,
                    lineHeight: theme.typography.lineHeight,
                    letterSpacing: `${theme.typography.letterSpacing}px`,
                }}
            >
                Welcome<br />
                <span style={{
                    fontSize: `${theme.typography.bodySize}px`,
                    fontWeight: weightVal(theme.typography.bodyWeight),
                    color: theme.typography.bodyColor,
                }}>We're glad you're here.</span>
            </div>
        );
    }

    const hAlign = theme.layoutSettings.horizontalAlignment === 'Left' ? 'items-start text-left'
        : theme.layoutSettings.horizontalAlignment === 'Right' ? 'items-end text-right'
            : 'items-center text-center';
    const vAlign = theme.layoutSettings.verticalAlignment === 'Top' ? 'justify-start'
        : theme.layoutSettings.verticalAlignment === 'Bottom' ? 'justify-end'
            : 'justify-center';

    const bgStyle = buildBgStyle();
    const overlayStyle = buildOverlayStyle();

    return (
        <main className="preview-container">
            <div className="preview-toolbar">
                <span className="preview-toolbar-title">Preview</span>
                <div className="preview-toolbar-controls">
                    {(['Fit', '50%', '75%', '100%', '125%'] as ZoomLevel[]).map(z => (
                        <button
                            key={z}
                            className={`zoom-btn ${zoom === z ? 'active' : ''}`}
                            onClick={() => setZoom(z)}
                        >
                            {z}
                        </button>
                    ))}
                </div>
            </div>

            <div className="preview-canvas-wrapper">
                <div
                    className="preview-canvas"
                    style={{
                        transform: zoom !== 'Fit' ? `scale(${zoomScale})` : undefined,
                    }}
                >
                    <div className="canvas-bg-layer" style={bgStyle} />

                    {overlayStyle && (
                        <div className="canvas-overlay-layer" style={overlayStyle} />
                    )}

                    {showGrid && (
                        <div className="canvas-grid-layer">
                            <div className="grid-line grid-line-h" style={{ top: '33.33%' }} />
                            <div className="grid-line grid-line-h" style={{ top: '66.66%' }} />
                            <div className="grid-line grid-line-v" style={{ left: '33.33%' }} />
                            <div className="grid-line grid-line-v" style={{ left: '66.66%' }} />
                        </div>
                    )}

                    {showSafeArea && (
                        <div className="canvas-safe-area" />
                    )}

                    <div
                        className={`canvas-text-wrapper ${vAlign} ${hAlign}`}
                        style={{
                            paddingTop: `${theme.layoutSettings.paddingTop}px`,
                            paddingBottom: `${theme.layoutSettings.paddingBottom}px`,
                            paddingLeft: `${theme.layoutSettings.paddingLeft}px`,
                            paddingRight: `${theme.layoutSettings.paddingRight}px`,
                            maxWidth: `${theme.layoutSettings.maxWidth}px`,
                            width: `${theme.layoutSettings.contentWidth}%`,
                        }}
                    >
                        {dummyText}
                    </div>
                </div>
            </div>

            <div className="preview-output-bar">
                <span className="output-label">Output</span>
                <span className="output-detail">1920×1080</span>
                <span className="output-detail">16:9</span>
                <div className="output-divider" />
                <button
                    className={`output-toggle ${showSafeArea ? 'active' : ''}`}
                    onClick={() => setShowSafeArea(!showSafeArea)}
                >
                    Safe Area
                </button>
                <button
                    className={`output-toggle ${showGrid ? 'active' : ''}`}
                    onClick={() => setShowGrid(!showGrid)}
                >
                    Grid
                </button>
            </div>
        </main>
    );
}

/* ─── Right Panel: Property Inspector Tabs ─── */

interface TabProps {
    theme: Theme;
    onUpdate: (updates: Partial<Theme>) => void;
}

/* ─── Content Tab ─── */

function ContentTab({ theme, onUpdate }: TabProps) {
    const [newTag, setNewTag] = useState('');

    const addTag = () => {
        if (newTag.trim() && !theme.tags.includes(newTag.trim())) {
            onUpdate({ tags: [...theme.tags, newTag.trim()] });
            setNewTag('');
        }
    };

    const removeTag = (tag: string) => {
        onUpdate({ tags: theme.tags.filter(t => t !== tag) });
    };

    return (
        <div className="inspector-sections">
            <div className="form-group">
                <label className="form-label">Theme Name</label>
                <input
                    type="text"
                    value={theme.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    className="form-input"
                />
            </div>

            <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                    value={theme.description}
                    onChange={(e) => onUpdate({ description: e.target.value })}
                    className="form-textarea"
                />
            </div>

            <div className="form-group">
                <label className="form-label">Category</label>
                <div className="segmented-control">
                    {(['Bible', 'Worship', 'General'] as Category[]).map(cat => (
                        <button
                            key={cat}
                            onClick={() => onUpdate({ category: cat })}
                            className={`segment-btn ${theme.category === cat ? 'active' : ''}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Layout</label>
                <div className="segmented-control">
                    {(['Fullscreen', 'Lower Third'] as LayoutType[]).map(l => (
                        <button
                            key={l}
                            onClick={() => onUpdate({ layout: l })}
                            className={`segment-btn ${theme.layout === l ? 'active' : ''}`}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Tags</label>
                <div className="tag-input-wrap">
                    <div className="tag-chips">
                        {theme.tags.map(tag => (
                            <span key={tag} className="tag-chip">
                                {tag}
                                <button onClick={() => removeTag(tag)}><X size={10} /></button>
                            </span>
                        ))}
                    </div>
                    <div className="tag-add-row">
                        <input
                            type="text"
                            placeholder="Add tag..."
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addTag()}
                            className="form-input"
                        />
                        <button onClick={addTag} className="btn-icon-sm"><Plus size={14} /></button>
                    </div>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Theme Author <span className="optional">(Optional)</span></label>
                <input
                    type="text"
                    value={theme.author}
                    onChange={(e) => onUpdate({ author: e.target.value })}
                    className="form-input"
                    placeholder="Enter author name..."
                />
            </div>

            <div className="form-group">
                <label className="form-label">Notes <span className="optional">(Optional)</span></label>
                <textarea
                    value={theme.notes}
                    onChange={(e) => onUpdate({ notes: e.target.value })}
                    className="form-textarea"
                    placeholder="Add notes about this theme..."
                />
            </div>
        </div>
    );
}

/* ─── Typography Tab ─── */

const fontOptions = ['Cormorant Garamond', 'Poppins', 'Playfair Display', 'Inter'];
const weightOptions: FontWeight[] = ['Light', 'Regular', 'Medium', 'Bold', 'Extra Bold'];

function TypographyTab({ theme, onUpdate }: TabProps) {
    const updateTypo = (key: keyof Theme['typography'], value: any) => {
        onUpdate({ typography: { ...theme.typography, [key]: value } });
    };

    return (
        <div className="inspector-sections">
            {/* Font Family */}
            <section className="inspector-section">
                <h3 className="inspector-section-title">Font Family</h3>

                <div className="field-row">
                    <label className="form-label">Heading</label>
                    <select
                        value={theme.typography.headingFont}
                        onChange={(e) => updateTypo('headingFont', e.target.value)}
                        className="form-select"
                    >
                        {fontOptions.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>

                <div className="field-row">
                    <label className="form-label">Body</label>
                    <select
                        value={theme.typography.bodyFont}
                        onChange={(e) => updateTypo('bodyFont', e.target.value)}
                        className="form-select"
                    >
                        {fontOptions.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>

                <div className="field-row">
                    <label className="form-label">Reference</label>
                    <select
                        value={theme.typography.referenceFont}
                        onChange={(e) => updateTypo('referenceFont', e.target.value)}
                        className="form-select"
                    >
                        {fontOptions.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
            </section>

            <hr className="hr-divider" />

            {/* Font Sizes */}
            <section className="inspector-section">
                <h3 className="inspector-section-title">Font Sizes</h3>

                <div className="slider-row">
                    <label className="form-label">Heading</label>
                    <input
                        type="range" min="24" max="144"
                        value={theme.typography.headingSize}
                        onChange={(e) => updateTypo('headingSize', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.headingSize}px</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Body</label>
                    <input
                        type="range" min="12" max="72"
                        value={theme.typography.bodySize}
                        onChange={(e) => updateTypo('bodySize', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.bodySize}px</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Reference</label>
                    <input
                        type="range" min="12" max="64"
                        value={theme.typography.referenceSize}
                        onChange={(e) => updateTypo('referenceSize', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.referenceSize}px</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Translation</label>
                    <input
                        type="range" min="10" max="48"
                        value={theme.typography.translationSize}
                        onChange={(e) => updateTypo('translationSize', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.translationSize}px</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Verse No.</label>
                    <input
                        type="range" min="8" max="40"
                        value={theme.typography.verseNumberSize}
                        onChange={(e) => updateTypo('verseNumberSize', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.verseNumberSize}px</span>
                </div>
            </section>

            <hr className="hr-divider" />

            {/* Font Weight */}
            <section className="inspector-section">
                <h3 className="inspector-section-title">Font Weight</h3>

                <div className="field-row">
                    <label className="form-label">Heading</label>
                    <div className="segmented-control compact">
                        {weightOptions.map(w => (
                            <button
                                key={w}
                                onClick={() => updateTypo('headingWeight', w)}
                                className={`segment-btn ${theme.typography.headingWeight === w ? 'active' : ''}`}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="field-row">
                    <label className="form-label">Body</label>
                    <div className="segmented-control compact">
                        {weightOptions.map(w => (
                            <button
                                key={w}
                                onClick={() => updateTypo('bodyWeight', w)}
                                className={`segment-btn ${theme.typography.bodyWeight === w ? 'active' : ''}`}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="field-row">
                    <label className="form-label">Reference</label>
                    <div className="segmented-control compact">
                        {weightOptions.map(w => (
                            <button
                                key={w}
                                onClick={() => updateTypo('referenceWeight', w)}
                                className={`segment-btn ${theme.typography.referenceWeight === w ? 'active' : ''}`}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <hr className="hr-divider" />

            {/* Colors */}
            <section className="inspector-section">
                <h3 className="inspector-section-title">Colors</h3>

                {[
                    { label: 'Heading', key: 'headingColor' as const },
                    { label: 'Body', key: 'bodyColor' as const },
                    { label: 'Reference', key: 'referenceColor' as const },
                    { label: 'Translation', key: 'translationColor' as const },
                    { label: 'Verse Number', key: 'verseNumberColor' as const },
                ].map(({ label, key }) => (
                    <div className="color-picker-row" key={key}>
                        <label className="form-label">{label}</label>
                        <div className="color-picker-wrap">
                            <input
                                type="color"
                                value={theme.typography[key]}
                                onChange={(e) => updateTypo(key, e.target.value)}
                                className="color-picker-input"
                            />
                            <span className="text-xs font-mono uppercase">{theme.typography[key]}</span>
                        </div>
                    </div>
                ))}
            </section>

            <hr className="hr-divider" />

            {/* Effects */}
            <section className="inspector-section">
                <h3 className="inspector-section-title">Effects</h3>

                <div className="checkbox-row">
                    <label className="form-label">Shadow</label>
                    <input
                        type="checkbox"
                        checked={theme.typography.shadow}
                        onChange={(e) => updateTypo('shadow', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                <div className="checkbox-row">
                    <label className="form-label">Outline</label>
                    <input
                        type="checkbox"
                        checked={theme.typography.outline}
                        onChange={(e) => updateTypo('outline', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                <div className="checkbox-row">
                    <label className="form-label">Glow</label>
                    <input
                        type="checkbox"
                        checked={theme.typography.glow}
                        onChange={(e) => updateTypo('glow', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                <div className="slider-row">
                    <label className="form-label">Opacity</label>
                    <input
                        type="range" min="0" max="100"
                        value={theme.typography.opacity}
                        onChange={(e) => updateTypo('opacity', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.opacity}%</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Blur</label>
                    <input
                        type="range" min="0" max="20" step="0.5"
                        value={theme.typography.blur}
                        onChange={(e) => updateTypo('blur', parseFloat(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.blur}px</span>
                </div>
            </section>

            <hr className="hr-divider" />

            {/* Line Height & Letter Spacing */}
            <section className="inspector-section">
                <h3 className="inspector-section-title">Spacing</h3>

                <div className="slider-row">
                    <label className="form-label">Line Height</label>
                    <input
                        type="range" min="0.8" max="2" step="0.05"
                        value={theme.typography.lineHeight}
                        onChange={(e) => updateTypo('lineHeight', parseFloat(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.lineHeight.toFixed(2)}</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Letter Spacing</label>
                    <input
                        type="range" min="-2" max="10" step="0.5"
                        value={theme.typography.letterSpacing}
                        onChange={(e) => updateTypo('letterSpacing', parseFloat(e.target.value))}
                    />
                    <span className="slider-value">{theme.typography.letterSpacing}px</span>
                </div>
            </section>

            <hr className="hr-divider" />

            {/* Text Transform & Alignment */}
            <section className="inspector-section">
                <h3 className="inspector-section-title">Transform</h3>
                <div className="segmented-control">
                    {(['Uppercase', 'Title Case', 'Sentence Case'] as TextTransform[]).map(t => (
                        <button
                            key={t}
                            onClick={() => updateTypo('textTransform', t)}
                            className={`segment-btn ${theme.typography.textTransform === t ? 'active' : ''}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </section>

            <section className="inspector-section">
                <h3 className="inspector-section-title">Alignment</h3>
                <div className="layout-align-grid">
                    {([
                        { val: 'Left', icon: AlignLeft },
                        { val: 'Center', icon: AlignCenter },
                        { val: 'Right', icon: AlignRight },
                    ] as { val: HorizontalAlignment; icon: any }[]).map(item => (
                        <button
                            key={item.val}
                            onClick={() => updateTypo('textAlignment', item.val)}
                            className={`layout-align-btn ${theme.typography.textAlignment === item.val ? 'active' : ''}`}
                        >
                            <item.icon size={18} />
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

/* ─── Background Tab ─── */

const bgTypes: { type: BackgroundType; icon: any }[] = [
    { type: 'Transparent', icon: Square },
    { type: 'Solid Color', icon: Palette },
    { type: 'Gradient', icon: Component },
    { type: 'Image', icon: ImageIcon },
    { type: 'Video', icon: MonitorPlay },
    { type: 'Pattern', icon: PenTool },
];

function BackgroundTab({ theme, onUpdate }: TabProps) {
    const updateBg = (key: keyof Theme['background'], value: any) => {
        onUpdate({ background: { ...theme.background, [key]: value } });
    };

    const bg = theme.background;

    return (
        <div className="inspector-sections">
            <section className="inspector-section">
                <h3 className="inspector-section-title">Background Type</h3>
                <div className="bg-type-grid">
                    {bgTypes.map(item => (
                        <button
                            key={item.type}
                            onClick={() => updateBg('type', item.type)}
                            className={`bg-type-btn ${bg.type === item.type ? 'active' : ''}`}
                        >
                            <item.icon size={18} />
                            <span>{item.type}</span>
                        </button>
                    ))}
                </div>
            </section>

            <hr className="hr-divider" />

            {/* Solid Color */}
            {bg.type === 'Solid Color' && (
                <section className="inspector-section">
                    <h3 className="inspector-section-title">Solid Color</h3>
                    <div className="color-picker-row">
                        <label className="form-label">Color</label>
                        <div className="color-picker-wrap">
                            <input
                                type="color"
                                value={bg.solidColor}
                                onChange={(e) => updateBg('solidColor', e.target.value)}
                                className="color-picker-input"
                            />
                            <span className="text-xs font-mono uppercase">{bg.solidColor}</span>
                        </div>
                    </div>
                </section>
            )}

            {/* Gradient */}
            {bg.type === 'Gradient' && (
                <section className="inspector-section">
                    <h3 className="inspector-section-title">Gradient</h3>
                    <div className="color-picker-row">
                        <label className="form-label">Start Color</label>
                        <div className="color-picker-wrap">
                            <input
                                type="color"
                                value={bg.gradientStart}
                                onChange={(e) => updateBg('gradientStart', e.target.value)}
                                className="color-picker-input"
                            />
                            <span className="text-xs font-mono uppercase">{bg.gradientStart}</span>
                        </div>
                    </div>
                    <div className="color-picker-row">
                        <label className="form-label">End Color</label>
                        <div className="color-picker-wrap">
                            <input
                                type="color"
                                value={bg.gradientEnd}
                                onChange={(e) => updateBg('gradientEnd', e.target.value)}
                                className="color-picker-input"
                            />
                            <span className="text-xs font-mono uppercase">{bg.gradientEnd}</span>
                        </div>
                    </div>
                    <div className="field-row">
                        <label className="form-label">Direction</label>
                        <select
                            value={bg.gradientDirection}
                            onChange={(e) => updateBg('gradientDirection', e.target.value as GradientDirection)}
                            className="form-select"
                        >
                            {(['Top to Bottom', 'Bottom to Top', 'Left to Right', 'Right to Left', 'Diagonal'] as GradientDirection[]).map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                </section>
            )}

            {/* Image */}
            {bg.type === 'Image' && (
                <section className="inspector-section">
                    <h3 className="inspector-section-title">Image</h3>
                    <div className="form-group">
                        <label className="form-label">Image URL</label>
                        <input
                            type="text"
                            value={bg.image}
                            onChange={(e) => updateBg('image', e.target.value)}
                            className="form-input"
                            placeholder="Paste image URL..."
                        />
                    </div>
                    <div className="field-row">
                        <label className="form-label">Fit</label>
                        <div className="segmented-control">
                            {(['Fit', 'Fill', 'Stretch', 'Tile'] as ImageFit[]).map(f => (
                                <button
                                    key={f}
                                    onClick={() => updateBg('imageFit', f)}
                                    className={`segment-btn ${bg.imageFit === f ? 'active' : ''}`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Video */}
            {bg.type === 'Video' && (
                <section className="inspector-section">
                    <h3 className="inspector-section-title">Video</h3>
                    <div className="form-group">
                        <label className="form-label">Video URL</label>
                        <input
                            type="text"
                            value={bg.videoUrl}
                            onChange={(e) => updateBg('videoUrl', e.target.value)}
                            className="form-input"
                            placeholder="Paste video URL..."
                        />
                    </div>
                    <div className="checkbox-row">
                        <label className="form-label">Loop</label>
                        <input
                            type="checkbox"
                            checked={bg.videoLoop}
                            onChange={(e) => updateBg('videoLoop', e.target.checked)}
                            className="checkbox-input"
                        />
                    </div>
                    <div className="checkbox-row">
                        <label className="form-label">Mute</label>
                        <input
                            type="checkbox"
                            checked={bg.videoMute}
                            onChange={(e) => updateBg('videoMute', e.target.checked)}
                            className="checkbox-input"
                        />
                    </div>
                </section>
            )}

            {/* Pattern */}
            {bg.type === 'Pattern' && (
                <section className="inspector-section">
                    <h3 className="inspector-section-title">Pattern</h3>
                    <div className="form-group">
                        <label className="form-label">Pattern</label>
                        <input
                            type="text"
                            value={bg.pattern}
                            onChange={(e) => updateBg('pattern', e.target.value)}
                            className="form-input"
                            placeholder="Pattern name..."
                        />
                    </div>
                    <div className="slider-row">
                        <label className="form-label">Scale</label>
                        <input
                            type="range" min="0.5" max="3" step="0.1"
                            value={bg.patternScale}
                            onChange={(e) => updateBg('patternScale', parseFloat(e.target.value))}
                        />
                        <span className="slider-value">{bg.patternScale.toFixed(1)}x</span>
                    </div>
                </section>
            )}

            <hr className="hr-divider" />

            {/* Common overlay settings for Image/Video */}
            {(bg.type === 'Image' || bg.type === 'Video') && (
                <section className="inspector-section">
                    <h3 className="inspector-section-title">Overlay</h3>

                    <div className="slider-row">
                        <label className="form-label">Brightness</label>
                        <input
                            type="range" min="0" max="100"
                            value={bg.brightness}
                            onChange={(e) => updateBg('brightness', parseInt(e.target.value))}
                        />
                        <span className="slider-value">{bg.brightness}%</span>
                    </div>

                    <div className="color-picker-row">
                        <label className="form-label">Overlay Color</label>
                        <div className="color-picker-wrap">
                            <input
                                type="color"
                                value={bg.overlayColor}
                                onChange={(e) => updateBg('overlayColor', e.target.value)}
                                className="color-picker-input"
                            />
                            <span className="text-xs font-mono uppercase">{bg.overlayColor}</span>
                        </div>
                    </div>

                    <div className="slider-row">
                        <label className="form-label">Overlay Opacity</label>
                        <input
                            type="range" min="0" max="100"
                            value={bg.overlayOpacity}
                            onChange={(e) => updateBg('overlayOpacity', parseInt(e.target.value))}
                        />
                        <span className="slider-value">{bg.overlayOpacity}%</span>
                    </div>

                    <div className="slider-row">
                        <label className="form-label">Blur</label>
                        <input
                            type="range" min="0" max="20" step="0.5"
                            value={bg.blur}
                            onChange={(e) => updateBg('blur', parseFloat(e.target.value))}
                        />
                        <span className="slider-value">{bg.blur}px</span>
                    </div>
                </section>
            )}

            {/* Extra settings */}
            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Container</h3>

                <div className="slider-row">
                    <label className="form-label">Corner Radius</label>
                    <input
                        type="range" min="0" max="48"
                        value={bg.cornerRadius}
                        onChange={(e) => updateBg('cornerRadius', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{bg.cornerRadius}px</span>
                </div>

                <div className="checkbox-row">
                    <label className="form-label">Border</label>
                    <input
                        type="checkbox"
                        checked={bg.border}
                        onChange={(e) => updateBg('border', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                {bg.border && (
                    <div className="color-picker-row">
                        <label className="form-label">Border Color</label>
                        <div className="color-picker-wrap">
                            <input
                                type="color"
                                value={bg.borderColor}
                                onChange={(e) => updateBg('borderColor', e.target.value)}
                                className="color-picker-input"
                            />
                            <span className="text-xs font-mono uppercase">{bg.borderColor}</span>
                        </div>
                    </div>
                )}

                <div className="checkbox-row">
                    <label className="form-label">Shadow</label>
                    <input
                        type="checkbox"
                        checked={bg.shadow}
                        onChange={(e) => updateBg('shadow', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>
            </section>
        </div>
    );
}

/* ─── Layout Tab ─── */

function LayoutTab({ theme, onUpdate }: TabProps) {
    const updateLayout = (key: keyof Theme['layoutSettings'], value: any) => {
        onUpdate({ layoutSettings: { ...theme.layoutSettings, [key]: value } });
    };

    return (
        <div className="inspector-sections">
            <section className="inspector-section">
                <h3 className="inspector-section-title">Content</h3>

                <div className="slider-row">
                    <label className="form-label">Content Width</label>
                    <input
                        type="range" min="10" max="100"
                        value={theme.layoutSettings.contentWidth}
                        onChange={(e) => updateLayout('contentWidth', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.layoutSettings.contentWidth}%</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Max Width</label>
                    <input
                        type="range" min="400" max="2000" step="50"
                        value={theme.layoutSettings.maxWidth}
                        onChange={(e) => updateLayout('maxWidth', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.layoutSettings.maxWidth}px</span>
                </div>
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Padding</h3>
                <div className="padding-grid">
                    {[
                        { label: 'Top', key: 'paddingTop' as const },
                        { label: 'Bottom', key: 'paddingBottom' as const },
                        { label: 'Left', key: 'paddingLeft' as const },
                        { label: 'Right', key: 'paddingRight' as const },
                    ].map(({ label, key }) => (
                        <div key={key} className="padding-item">
                            <span className="text-xs text-outline">{label}</span>
                            <div className="d-flex items-center">
                                <input
                                    type="number"
                                    value={theme.layoutSettings[key]}
                                    onChange={(e) => updateLayout(key, parseInt(e.target.value) || 0)}
                                />
                                <span className="text-xs text-outline ml-1">px</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Vertical Alignment</h3>
                <div className="layout-align-grid">
                    {([
                        { val: 'Top', icon: AlignVerticalJustifyStart },
                        { val: 'Center', icon: AlignVerticalJustifyCenter },
                        { val: 'Bottom', icon: AlignVerticalJustifyEnd },
                    ] as { val: VerticalAlignment; icon: any }[]).map(item => (
                        <button
                            key={item.val}
                            onClick={() => updateLayout('verticalAlignment', item.val)}
                            className={`layout-align-btn ${theme.layoutSettings.verticalAlignment === item.val ? 'active' : ''}`}
                        >
                            <item.icon size={18} />
                        </button>
                    ))}
                </div>
            </section>

            <section className="inspector-section">
                <h3 className="inspector-section-title">Horizontal Alignment</h3>
                <div className="layout-align-grid">
                    {([
                        { val: 'Left', icon: AlignLeft },
                        { val: 'Center', icon: AlignCenter },
                        { val: 'Right', icon: AlignRight },
                    ] as { val: HorizontalAlignment; icon: any }[]).map(item => (
                        <button
                            key={item.val}
                            onClick={() => updateLayout('horizontalAlignment', item.val)}
                            className={`layout-align-btn ${theme.layoutSettings.horizontalAlignment === item.val ? 'active' : ''}`}
                        >
                            <item.icon size={18} />
                        </button>
                    ))}
                </div>
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Safe Area</h3>
                <div className="checkbox-row">
                    <label className="form-label">Enable Safe Area</label>
                    <input
                        type="checkbox"
                        checked={theme.layoutSettings.safeArea}
                        onChange={(e) => updateLayout('safeArea', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>
            </section>

            {theme.layout === 'Lower Third' && (
                <section className="inspector-section">
                    <h3 className="inspector-section-title">Reference Position</h3>
                    <div className="layout-align-grid">
                        {([
                            { val: 'Left', icon: AlignLeft },
                            { val: 'Center', icon: AlignCenter },
                            { val: 'Right', icon: AlignRight },
                        ] as { val: HorizontalAlignment; icon: any }[]).map(item => (
                            <button
                                key={item.val}
                                onClick={() => updateLayout('referencePosition', item.val)}
                                className={`layout-align-btn ${theme.layoutSettings.referencePosition === item.val ? 'active' : ''}`}
                            >
                                <item.icon size={18} />
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Text Container</h3>

                <div className="slider-row">
                    <label className="form-label">Container Width</label>
                    <input
                        type="range" min="20" max="100"
                        value={theme.layoutSettings.textContainerWidth}
                        onChange={(e) => updateLayout('textContainerWidth', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.layoutSettings.textContainerWidth}%</span>
                </div>

                <div className="field-row">
                    <label className="form-label">Stack Direction</label>
                    <div className="segmented-control">
                        {(['Vertical', 'Horizontal'] as const).map(d => (
                            <button
                                key={d}
                                onClick={() => updateLayout('stackDirection', d)}
                                className={`segment-btn ${theme.layoutSettings.stackDirection === d ? 'active' : ''}`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="slider-row">
                    <label className="form-label">Spacing</label>
                    <input
                        type="range" min="0" max="64"
                        value={theme.layoutSettings.spacing}
                        onChange={(e) => updateLayout('spacing', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.layoutSettings.spacing}px</span>
                </div>
            </section>
        </div>
    );
}

/* ─── Bible Tab ─── */

function BibleTab({ theme, onUpdate }: TabProps) {
    const updateBible = (key: keyof Theme['bibleSettings'], value: any) => {
        onUpdate({ bibleSettings: { ...theme.bibleSettings, [key]: value } });
    };

    return (
        <div className="inspector-sections">
            <section className="inspector-section">
                <h3 className="inspector-section-title">Reference</h3>

                <div className="checkbox-row">
                    <label className="form-label">Show Reference</label>
                    <input
                        type="checkbox"
                        checked={theme.bibleSettings.showReference}
                        onChange={(e) => updateBible('showReference', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                {theme.bibleSettings.showReference && (
                    <>
                        <div className="field-row">
                            <label className="form-label">Position</label>
                            <div className="segmented-control">
                                {(['Above Verse', 'Below Verse', 'Inline'] as const).map(pos => (
                                    <button
                                        key={pos}
                                        onClick={() => updateBible('referencePosition', pos)}
                                        className={`segment-btn ${theme.bibleSettings.referencePosition === pos ? 'active' : ''}`}
                                    >
                                        {pos}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="field-row">
                            <label className="form-label">Reference Style</label>
                            <select
                                value={theme.bibleSettings.referenceStyle}
                                onChange={(e) => updateBible('referenceStyle', e.target.value)}
                                className="form-select"
                            >
                                <option value="Genesis 1:1">Genesis 1:1</option>
                                <option value="GENESIS 1:1">GENESIS 1:1</option>
                                <option value="Genesis 1:1 (NIV)">Genesis 1:1 (NIV)</option>
                                <option value="GENESIS 1:1 (NIV)">GENESIS 1:1 (NIV)</option>
                                <option value="1:1">1:1</option>
                                <option value="1">1</option>
                            </select>
                        </div>
                    </>
                )}
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Translation</h3>

                <div className="checkbox-row">
                    <label className="form-label">Show Translation</label>
                    <input
                        type="checkbox"
                        checked={theme.bibleSettings.showTranslation}
                        onChange={(e) => updateBible('showTranslation', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                {theme.bibleSettings.showTranslation && (
                    <div className="field-row">
                        <label className="form-label">Position</label>
                        <div className="segmented-control">
                            {(['Beside Reference', 'Below Reference', 'Hidden'] as const).map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => updateBible('translationPosition', pos)}
                                    className={`segment-btn ${theme.bibleSettings.translationPosition === pos ? 'active' : ''}`}
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Verse Number</h3>

                <div className="checkbox-row">
                    <label className="form-label">Show Verse Number</label>
                    <input
                        type="checkbox"
                        checked={theme.bibleSettings.showVerseNumber}
                        onChange={(e) => updateBible('showVerseNumber', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                {theme.bibleSettings.showVerseNumber && (
                    <div className="field-row">
                        <label className="form-label">Style</label>
                        <div className="segmented-control">
                            {(['Before Verse', 'Superscript', 'Hidden'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => updateBible('verseNumberStyle', s)}
                                    className={`segment-btn ${theme.bibleSettings.verseNumberStyle === s ? 'active' : ''}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Multi Verse</h3>

                <div className="field-row">
                    <label className="form-label">Behaviour</label>
                    <div className="segmented-control">
                        {(['Paragraph', 'Each Verse New Line', 'Verse Blocks'] as const).map(b => (
                            <button
                                key={b}
                                onClick={() => updateBible('multiVerseBehavior', b)}
                                className={`segment-btn ${theme.bibleSettings.multiVerseBehavior === b ? 'active' : ''}`}
                            >
                                {b}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Reference Appearance</h3>

                <div className="field-row">
                    <label className="form-label">Alignment</label>
                    <div className="layout-align-grid">
                        {([
                            { val: 'Left', icon: AlignLeft },
                            { val: 'Center', icon: AlignCenter },
                            { val: 'Right', icon: AlignRight },
                        ] as { val: HorizontalAlignment; icon: any }[]).map(item => (
                            <button
                                key={item.val}
                                onClick={() => updateBible('referenceAlignment', item.val)}
                                className={`layout-align-btn ${theme.bibleSettings.referenceAlignment === item.val ? 'active' : ''}`}
                            >
                                <item.icon size={18} />
                            </button>
                        ))}
                    </div>
                </div>

                <div className="color-picker-row">
                    <label className="form-label">Reference Color</label>
                    <div className="color-picker-wrap">
                        <input
                            type="color"
                            value={theme.bibleSettings.referenceColor}
                            onChange={(e) => updateBible('referenceColor', e.target.value)}
                            className="color-picker-input"
                        />
                        <span className="text-xs font-mono uppercase">{theme.bibleSettings.referenceColor}</span>
                    </div>
                </div>

                <div className="slider-row">
                    <label className="form-label">Reference Size</label>
                    <input
                        type="range" min="12" max="64"
                        value={theme.bibleSettings.referenceSize}
                        onChange={(e) => updateBible('referenceSize', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.bibleSettings.referenceSize}px</span>
                </div>

                <div className="field-row">
                    <label className="form-label">Weight</label>
                    <div className="segmented-control compact">
                        {weightOptions.map(w => (
                            <button
                                key={w}
                                onClick={() => updateBible('referenceWeight', w)}
                                className={`segment-btn ${theme.bibleSettings.referenceWeight === w ? 'active' : ''}`}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}

/* ─── Worship Tab ─── */

function WorshipTab({ theme, onUpdate }: TabProps) {
    const updateWorship = (key: keyof Theme['worshipSettings'], value: any) => {
        onUpdate({ worshipSettings: { ...theme.worshipSettings, [key]: value } });
    };

    return (
        <div className="inspector-sections">
            <section className="inspector-section">
                <h3 className="inspector-section-title">Song Title</h3>

                <div className="checkbox-row">
                    <label className="form-label">Show Song Title</label>
                    <input
                        type="checkbox"
                        checked={theme.worshipSettings.showSongTitle}
                        onChange={(e) => updateWorship('showSongTitle', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                {theme.worshipSettings.showSongTitle && (
                    <div className="field-row">
                        <label className="form-label">Position</label>
                        <div className="segmented-control">
                            {(['Top', 'Bottom', 'Hidden'] as const).map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => updateWorship('songTitlePosition', pos)}
                                    className={`segment-btn ${theme.worshipSettings.songTitlePosition === pos ? 'active' : ''}`}
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Chorus Label</h3>

                <div className="checkbox-row">
                    <label className="form-label">Show Chorus Label</label>
                    <input
                        type="checkbox"
                        checked={theme.worshipSettings.showChorusLabel}
                        onChange={(e) => updateWorship('showChorusLabel', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                {theme.worshipSettings.showChorusLabel && (
                    <div className="field-row">
                        <label className="form-label">Label Style</label>
                        <div className="segmented-control">
                            {(['CHORUS', 'Verse 1', 'Bridge', 'Tag'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => updateWorship('labelStyle', s)}
                                    className={`segment-btn ${theme.worshipSettings.labelStyle === s ? 'active' : ''}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Slide Break</h3>
                <div className="segmented-control">
                    {(['Automatic', 'Manual'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => updateWorship('slideBreak', s)}
                            className={`segment-btn ${theme.worshipSettings.slideBreak === s ? 'active' : ''}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </section>

            <section className="inspector-section">
                <h3 className="inspector-section-title">Limits</h3>

                <div className="slider-row">
                    <label className="form-label">Max Lines</label>
                    <input
                        type="range" min="1" max="10"
                        value={theme.worshipSettings.maxLines}
                        onChange={(e) => updateWorship('maxLines', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.worshipSettings.maxLines}</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Max Characters</label>
                    <input
                        type="range" min="20" max="120"
                        value={theme.worshipSettings.maxCharacters}
                        onChange={(e) => updateWorship('maxCharacters', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{theme.worshipSettings.maxCharacters}</span>
                </div>
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Behaviour</h3>

                <div className="checkbox-row">
                    <label className="form-label">Keep Chorus Together</label>
                    <input
                        type="checkbox"
                        checked={theme.worshipSettings.keepChorusTogether}
                        onChange={(e) => updateWorship('keepChorusTogether', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>

                <div className="field-row">
                    <label className="form-label">Text Alignment</label>
                    <div className="layout-align-grid">
                        {([
                            { val: 'Left', icon: AlignLeft },
                            { val: 'Center', icon: AlignCenter },
                            { val: 'Right', icon: AlignRight },
                        ] as { val: HorizontalAlignment; icon: any }[]).map(item => (
                            <button
                                key={item.val}
                                onClick={() => updateWorship('textAlignment', item.val)}
                                className={`layout-align-btn ${theme.worshipSettings.textAlignment === item.val ? 'active' : ''}`}
                            >
                                <item.icon size={18} />
                            </button>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}

/* ─── Animation Tab ─── */

const animationOptions: AnimationType[] = ['None', 'Fade', 'Slide Left', 'Slide Right', 'Slide Up', 'Slide Down', 'Zoom', 'Scale', 'Blur', 'Bounce'];
const easingOptions: Easing[] = ['Linear', 'Ease', 'Ease In', 'Ease Out', 'Ease In Out'];

function AnimationTab({ theme, onUpdate }: TabProps) {
    const updateAnim = (key: keyof Theme['animationSettings'], value: any) => {
        onUpdate({ animationSettings: { ...theme.animationSettings, [key]: value } });
    };

    return (
        <div className="inspector-sections">
            <section className="inspector-section">
                <h3 className="inspector-section-title">Animate In</h3>
                <div className="segmented-control">
                    {animationOptions.map(a => (
                        <button
                            key={a}
                            onClick={() => updateAnim('animateIn', a)}
                            className={`segment-btn ${theme.animationSettings.animateIn === a ? 'active' : ''}`}
                        >
                            {a}
                        </button>
                    ))}
                </div>
            </section>

            <section className="inspector-section">
                <h3 className="inspector-section-title">Animate Out</h3>
                <div className="segmented-control">
                    {animationOptions.map(a => (
                        <button
                            key={a}
                            onClick={() => updateAnim('animateOut', a)}
                            className={`segment-btn ${theme.animationSettings.animateOut === a ? 'active' : ''}`}
                        >
                            {a}
                        </button>
                    ))}
                </div>
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Timing</h3>

                <div className="slider-row">
                    <label className="form-label">Duration</label>
                    <input
                        type="range" min="0" max="2" step="0.1"
                        value={theme.animationSettings.duration}
                        onChange={(e) => updateAnim('duration', parseFloat(e.target.value))}
                    />
                    <span className="slider-value">{theme.animationSettings.duration.toFixed(1)}s</span>
                </div>

                <div className="slider-row">
                    <label className="form-label">Delay</label>
                    <input
                        type="range" min="0" max="5" step="0.1"
                        value={theme.animationSettings.delay}
                        onChange={(e) => updateAnim('delay', parseFloat(e.target.value))}
                    />
                    <span className="slider-value">{theme.animationSettings.delay.toFixed(1)}s</span>
                </div>
            </section>

            <section className="inspector-section">
                <h3 className="inspector-section-title">Easing</h3>
                <div className="segmented-control">
                    {easingOptions.map(e => (
                        <button
                            key={e}
                            onClick={() => updateAnim('easing', e)}
                            className={`segment-btn ${theme.animationSettings.easing === e ? 'active' : ''}`}
                        >
                            {e}
                        </button>
                    ))}
                </div>
            </section>

            <hr className="hr-divider" />

            <section className="inspector-section">
                <h3 className="inspector-section-title">Loop</h3>
                <div className="checkbox-row">
                    <label className="form-label">Loop Animation</label>
                    <input
                        type="checkbox"
                        checked={theme.animationSettings.loop}
                        onChange={(e) => updateAnim('loop', e.target.checked)}
                        className="checkbox-input"
                    />
                </div>
            </section>

            <button className="btn-preview-anim">
                <Play size={14} /> Preview Animation
            </button>
        </div>
    );
}

/* ─── Inspector (Right Panel) ─── */

type TabId = 'Content' | 'Typography' | 'Background' | 'Layout' | 'Bible' | 'Worship' | 'Animation';

interface InspectorProps {
    theme: Theme;
    onUpdate: (updates: Partial<Theme>) => void;
}

function Inspector({ theme, onUpdate }: InspectorProps) {
    const [activeTab, setActiveTab] = useState<TabId>('Content');

    const tabs: TabId[] = ['Content', 'Typography', 'Background', 'Layout'];
    if (theme.category === 'Bible') tabs.push('Bible');
    if (theme.category === 'Worship') tabs.push('Worship');
    tabs.push('Animation');

    if (!tabs.includes(activeTab)) {
        setActiveTab('Content');
    }

    return (
        <aside className="inspector">
            <div className="inspector-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`inspector-tab ${activeTab === tab ? 'active' : ''}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="inspector-content">
                {activeTab === 'Content' && <ContentTab theme={theme} onUpdate={onUpdate} />}
                {activeTab === 'Typography' && <TypographyTab theme={theme} onUpdate={onUpdate} />}
                {activeTab === 'Background' && <BackgroundTab theme={theme} onUpdate={onUpdate} />}
                {activeTab === 'Layout' && <LayoutTab theme={theme} onUpdate={onUpdate} />}
                {activeTab === 'Bible' && theme.category === 'Bible' && <BibleTab theme={theme} onUpdate={onUpdate} />}
                {activeTab === 'Worship' && theme.category === 'Worship' && <WorshipTab theme={theme} onUpdate={onUpdate} />}
                {activeTab === 'Animation' && <AnimationTab theme={theme} onUpdate={onUpdate} />}
            </div>
        </aside>
    );
}

/* ─── App ─── */

export default function App() {
    const [themes, setThemes] = useState<Theme[]>(defaultThemes);
    const [activeThemeId, setActiveThemeId] = useState<string>(themes[0].id);

    const activeTheme = themes.find(t => t.id === activeThemeId) || themes[0];

    const handleUpdateTheme = (updates: Partial<Theme>) => {
        setThemes(prev => prev.map(t =>
            t.id === activeThemeId ? { ...t, ...updates } : t
        ));
    };

    const handleCreateTheme = () => {
        const newTheme: Theme = {
            ...activeTheme,
            id: Date.now().toString(),
            name: `${activeTheme.name} Copy`,
            favorited: false,
        };
        setThemes([...themes, newTheme]);
        setActiveThemeId(newTheme.id);
    };

    const handleDeleteTheme = () => {
        if (themes.length <= 1) return;
        const newThemes = themes.filter(t => t.id !== activeThemeId);
        setThemes(newThemes);
        setActiveThemeId(newThemes[0].id);
    };

    const handleDuplicate = () => {
        handleCreateTheme();
    };

    const handleToggleFavorite = (id: string) => {
        setThemes(prev => prev.map(t =>
            t.id === id ? { ...t, favorited: !t.favorited } : t
        ));
    };

    return (
        <div className="app-layout">
            {/* Top Toolbar */}
            <header className="top-nav">
                <div className="nav-left">
                    <div className="nav-actions">
                        <button className="icon-btn" title="Undo">
                            <Undo size={18} />
                        </button>
                        <button className="icon-btn" title="Redo">
                            <Redo size={18} />
                        </button>
                    </div>
                </div>

                <div className="nav-right">
                    <button onClick={handleDuplicate} className="btn btn-outline">
                        <Copy size={16} /> Duplicate
                    </button>
                    <button onClick={handleDeleteTheme} className="btn btn-danger">
                        <Trash2 size={16} /> Delete
                    </button>
                    <div className="divider-vertical" />
                    <button className="btn btn-primary">
                        <Save size={16} /> Save Theme
                    </button>
                    <button className="icon-btn" title="Close">
                        <X size={20} />
                    </button>
                </div>
            </header>

            <div className="main-content">
                {/* Left: Theme Library */}
                <ThemeLibrary
                    themes={themes}
                    activeThemeId={activeThemeId}
                    onSelectTheme={setActiveThemeId}
                    onCreateTheme={handleCreateTheme}
                    onToggleFavorite={handleToggleFavorite}
                    onImport={() => { }}
                    onExport={() => { }}
                />

                {/* Center: Live Preview */}
                <PreviewCanvas theme={activeTheme} />

                {/* Right: Property Inspector */}
                <Inspector theme={activeTheme} onUpdate={handleUpdateTheme} />
            </div>
        </div>
    );
}
