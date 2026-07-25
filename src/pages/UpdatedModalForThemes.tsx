import './UpdatedModalForThemes.css';
import {
    X, ChevronDown,
    Bold, Italic, Underline, Strikethrough,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Image as ImageIcon, RefreshCw, Link, Type, Bookmark, LayoutGrid
} from 'lucide-react';

export default function App() {
    return (
        <div className="app-container">

            {/* Top Header */}


            {/* Main Workspace Workspace */}
            <div className="workspace">

                {/* Left Sidebar */}
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <span className="sidebar-title">PROPERTIES</span>
                        <button className="icon-btn" title="Close"><X size={15} /></button>
                    </div>

                    <div className="sidebar-content">

                        {/* Layout Panel */}
                        <div className="panel">
                            <div className="panel-header">
                                <LayoutGrid size={14} className="panel-header-icon" />
                                LAYOUT
                            </div>
                            <div className="panel-body">
                                <div className="btn-group">
                                    <button className="btn-tab active" title="Fullscreen">Fullscreen</button>
                                    <button className="btn-tab" title="Lower Third">Lower Third</button>
                                </div>
                            </div>
                        </div>

                        {/* Categories Panel */}
                        <div className="panel panel-categories">
                            <div className="panel-header">
                                <Bookmark size={14} className="panel-header-icon" />
                                CATEGORIES
                            </div>
                            <div className="panel-body">
                                <div className="btn-group" style={{ gap: '8px', padding: '0', border: 'none', backgroundColor: 'transparent' }}>
                                    <button className="btn-tab active" style={{ width: '80px', flex: 'none' }} title="Bible">Bible</button>
                                    <button className="btn-tab" title="Worship">Worship</button>
                                    <button className="btn-tab" title="General">General</button>
                                </div>
                            </div>
                        </div>

                        {/* Typography Panel */}
                        <div className="panel">
                            <div className="panel-header">
                                <Type size={14} className="panel-header-icon" />
                                TYPOGRAPHY
                            </div>
                            <div className="panel-body">
                                {/* Font selector row */}
                                <div className="typography-row">
                                    <div className="select-box">
                                        <span>CMG Sans</span>
                                        <ChevronDown size={14} className="panel-header-icon" />
                                    </div>
                                    <div className="value-box">
                                        <span>48</span>
                                    </div>
                                    <div className="color-box"></div>
                                </div>

                                {/* Formats row */}
                                <div className="format-group">
                                    <button className="format-btn" title="Bold"><Bold size={16} /></button>
                                    <div className="format-divider"></div>
                                    <button className="format-btn" title="Italic"><Italic size={16} /></button>
                                    <div className="format-divider"></div>
                                    <button className="format-btn active" title="Underline"><Underline size={16} /></button>
                                    <div className="format-divider"></div>
                                    <button className="format-btn" title="Strikethrough"><Strikethrough size={16} /></button>
                                </div>

                                {/* Casing row */}
                                <div className="case-group">
                                    <button className="case-btn active" title="Uppercase">Uppercase</button>
                                    <button className="case-btn" title="lowercase">lowercase</button>
                                    <button className="case-btn" title="Title Case">Title Case</button>
                                </div>

                                {/* Sliders row */}
                                <div className="slider-row">
                                    <div className="slider-wrapper">
                                        <span>PAD</span>
                                        <div className="slider-val">60</div>
                                    </div>
                                    <div className="slider-wrapper flex-1">
                                        <span>LINE</span>
                                        <input type="range" defaultValue={60} />
                                    </div>
                                </div>

                                {/* Alignment row */}
                                <div className="format-group" style={{ marginTop: '4px' }}>
                                    <button className="format-btn" title="Align left"><AlignLeft size={16} /></button>
                                    <div className="format-divider"></div>
                                    <button className="format-btn active" title="Align center"><AlignCenter size={16} /></button>
                                    <div className="format-divider"></div>
                                    <button className="format-btn" title="Align right"><AlignRight size={16} /></button>
                                    <div className="format-divider"></div>
                                    <button className="format-btn" title="Justify"><AlignJustify size={16} /></button>
                                </div>
                            </div>
                        </div>

                        {/* Background Panel */}
                        <div className="panel">
                            <div className="panel-header">
                                <ImageIcon size={14} className="panel-header-icon" />
                                BACKGROUND
                            </div>
                            <div className="panel-body">
                                <div className="bg-row">
                                    <div className="bg-thumb">
                                        <img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=150" alt="Thumbnail" />
                                    </div>
                                    <div className="bg-info">
                                        <div className="bg-title">Image Background</div>
                                        <div className="bg-subtitle">2026-06-13 23.09.14.jpg</div>
                                    </div>
                                    <button className="bg-refresh" title="Refresh">
                                        <RefreshCw size={14} />
                                    </button>
                                </div>

                                <div className="opacity-row">
                                    <span>OPACITY</span>
                                    <input type="range" defaultValue={100} />
                                    <span>100%</span>
                                </div>
                            </div>
                        </div>

                        {/* Animation Panel */}
                        <div className="panel">
                            <div className="panel-header" style={{ paddingBottom: '12px' }}>
                                <Link size={14} className="panel-header-icon" />
                                ANIMATION
                            </div>
                        </div>

                    </div>

                    {/* Save Button Fixed Area */}
                    <div className="save-area">
                        <button className="save-btn" title="Save">SAVE</button>
                    </div>
                </aside>

                {/* Main Canvas Area */}
                <main className="canvas-area">
                    {/* Top Right Floating Elements */}
                    <div className="floating-indicators">
                        <div className="indicator-pill">
                            <div className="indicator-left">
                                <div className="dot-wrapper">
                                    <div className="dot-ping"></div>
                                    <div className="dot-core"></div>
                                </div>
                                <span className="indicator-text">LIVE PREVIEW</span>
                            </div>
                            <div className="indicator-right">
                                <span className="indicator-text">BIBLE</span>
                            </div>
                        </div>
                    </div>

                    {/* Lower Third Preview Canvas Wrapper */}
                    <div className="preview-wrapper">
                        {/* The TV Screen Frame */}
                        <div className="tv-screen">
                            {/* Background Plate layer simulating video playing */}
                            <div className="tv-bg-plate" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=2000')" }}></div>
                            <div className="tv-gradient"></div>

                            {/* Lower Third Glass Content Element */}
                            <div className="lower-third-glass">

                                {/* The glowing accent slice effect */}


                                <div className="glass-content">
                                    <h1 className="glass-title">
                                        For God so loved the world,
                                        that he gave his only begotten
                                        son, that whosoever believeth
                                        in him should not perish, but
                                        have everlasting life.
                                    </h1>

                                    <div className="glass-subtitle-row">

                                        <span className="glass-subtitle-text">JOHN 3:16</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Right Resolution */}
                    <div className="resolution-info">
                        1920x1080 • 16:9
                    </div>
                </main>

            </div>
        </div>
    );
}
