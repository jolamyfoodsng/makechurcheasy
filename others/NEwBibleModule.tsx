import React, { useState, useRef } from 'react';
import './NEwBibleModule.css';
import { Play, MicOff, Mic, ChevronDown, ChevronLeft, ChevronRight, Check, Search, X, Plus, AlertCircle, Download, Trash2, AlertTriangle } from 'lucide-react';

export interface Verse { id: string; text: string; }
export interface QueueItem { id: string; title: string; type: string; active?: boolean; }
export interface Detection { id: string; reference: string; text: string; }

export const verses: Verse[] = [
    { id: '13', text: 'But the angel said to him, "Do not be afraid, Zacharias, for your prayer is heard; and your wife Elizabeth will bear you a son, and you shall call his name John.' },
    { id: '14', text: 'And you will have joy and gladness, and many will rejoice at his birth.' },
    { id: '15', text: 'For he will be great in the sight of the Lord, and shall drink neither wine nor strong drink. He will also be filled with the Holy Spirit, even from his mother\'s womb.' },
    { id: '16', text: 'And he will turn many of the children of Israel to the Lord their God.' },
    { id: '17', text: 'He will also go before Him in the spirit and power of Elijah, \'to turn the hearts of the fathers to the children,\' and the disobedient to the wisdom of the just, to make ready a people prepared for the Lord."' },
    { id: '18', text: 'And Zacharias said to the angel, "How shall I know this? For I am an old man, and my wife is well advanced in years."' },
    { id: '19', text: 'And the angel answered and said to him, "I am Gabriel, who stands in the presence of God, and was sent to speak to you and bring you these glad tidings.' },
    { id: '20', text: 'But behold, you will be mute and not able to speak until the day these things take place, because you did not believe my words which will be fulfilled in their own time."' }
];

export const initialQueue: QueueItem[] = [
    { id: 'q1', title: 'Job 15:14', type: 'Manual' },
    { id: 'q2', title: 'Ezekiel 23:39', type: 'Manual' },
    { id: 'q3', title: 'Luke 1:17', type: 'Manual', active: true },
    { id: 'q4', title: 'Daniel 5:11', type: 'Manual' },
];

export const detections: Detection[] = [
    { id: 'd1', reference: 'Proverbs 14:12', text: 'There is a way that seems right to a man, But its end is the way of death.' },
    { id: 'd2', reference: 'Proverbs 16:25', text: 'There is a way that seems right to a man, But its end is the way of death.' },
    { id: 'd3', reference: 'Proverbs 24:32', text: 'When I saw it, I considered it well; I looked on it and received instruction:' },
];

function TranscriptSidebar({ isTranscribing, onRequestStop, onStart }: any) {
    return (
        <aside className="sidebar transcript-sidebar">
            <div className="sidebar-section audio-input-section">
                <label className="section-label">Audio Input</label>
                <div className="input-with-icon">
                    <select className="custom-select">
                        <option>Default Microphone</option>
                        <option>USB Audio Device</option>
                        <option>Studio Interface (Input 1)</option>
                    </select>
                    <Mic className="icon left-icon" />
                    <ChevronDown className="icon right-icon" />
                </div>
            </div>
            <div className="card-header no-top-border">
                <h2 className="header-title">Live transcript</h2>
                <div className="audio-visualizer">
                    {isTranscribing ? (
                        <>
                            <div className="bar bar-1 active"></div>
                            <div className="bar bar-2 active"></div>
                            <div className="bar bar-3 active"></div>
                            <div className="bar bar-4 active"></div>
                        </>
                    ) : (
                        <>
                            <div className="bar bar-1 inactive"></div>
                            <div className="bar bar-2 inactive"></div>
                            <div className="bar bar-3 inactive"></div>
                            <div className="bar bar-4 inactive"></div>
                        </>
                    )}
                </div>
            </div>
            <div className="transcript-content scrollbar-hide">
                <p>about our age he says,</p>
                <p>he will go also before him in the spirit and the power of Elijah</p>
                <p>to turn the heart of the fathers to the children and the disobedience to the what?</p>
                <p>The wisdom of the just. That's what Amandu described to you.</p>
                <p>That there is a way we live our lives.</p>
                <div className="transcript-highlight">
                    There is a way we think. {isTranscribing && <span className="pulse-dot"></span>}
                </div>
            </div>
            <div className="sidebar-footer">
                {isTranscribing ? (
                    <button className="btn btn-danger full-width" onClick={onRequestStop}>
                        <MicOff className="icon" /> Stop transcribing
                    </button>
                ) : (
                    <button className="btn btn-primary full-width" onClick={onStart}>
                        <Play className="icon fill-icon" /> Start transcribing
                    </button>
                )}
            </div>
        </aside>
    );
}

function Monitors({ activeItem }: any) {
    const bgPreview = "https://lh3.googleusercontent.com/aida-public/AB6AXuB4UI71703MYvGWQLsyTfOEGZ23-b3uBHfa1uz2NI8JAWlT59GyB7BMZkYho7tiN4hTqHBxKdXKR0YEIcXpF9aJYW4Ov82nv7H4JGUpKRkzK3Z0UMk8RxX2EkxNhGbSDs67MxhObcnfDj38KYbDeTmX2sUSkoxHEtjBydPUlh8lAX4AEQ6cALFVxXdAT7Qy3AN-CQpIEn8DYdP-qLy620E5oUhXXdcDQ5Y7JqHikW0z726pnHzPEBAhVwVBiSpPEc5lZh0A2tPgSqs";
    const bgLive = "https://lh3.googleusercontent.com/aida-public/AB6AXuAHfPmfEHYdQe5NAj3IrC1D0d51SddcksgBJB0vskNbGgj1v_P3DzirxrXLs48oFRNQBDFVdQtX6S8qxyi691Oo_1SRS8H5zT_t6_ZnIsIHKnVj6_cgQWSRcCHxL2f5Oohr3HxGhPUu_jh6eu43LYCIwhMQ-RaGyg1Oy8UMv0C0bd0r57uslaRbz1mn5EWSqbH8xXuV5YWbr-7WGCMmdLX-W881lBi0hXWQVz3l_9ea3sMiZyk35ukXSHTOWbOudc_P7bIwq8-J7eU";

    const verseMatch = activeItem.reference.match(/:(\d+)/);
    const verseNumber = verseMatch ? verseMatch[1] : null;

    return (
        <div className="monitors-container">
            <div className="card-panel monitor-panel">
                <div className="card-header"><h2 className="header-title">Program preview</h2></div>
                <div className="monitor-display">
                    <div className="monitor-bg" style={{ backgroundImage: `url(${bgPreview})` }}></div>
                    <div className="monitor-content">
                        <span className="monitor-reference">{activeItem.reference} (NKJV)</span>
                        <p className="monitor-text">
                            {verseNumber && <sup className="verse-number">{verseNumber}</sup>}
                            {activeItem.text}
                        </p>
                    </div>
                </div>
            </div>

            <div className="card-panel monitor-panel live-monitor">
                <div className="live-indicator-line"></div>
                <div className="card-header">
                    <h2 className="header-title"><span className="live-dot"></span> Live display</h2>
                    <div className="go-live-wrapper">
                        <span className="go-live-label">Go live</span>
                        <div className="toggle-switch active">
                            <div className="toggle-knob"></div>
                        </div>
                    </div>
                </div>
                <div className="monitor-display">
                    <div className="monitor-bg" style={{ backgroundImage: `url(${bgLive})` }}></div>
                    <div className="monitor-content">
                        <span className="monitor-reference">{activeItem.reference} (NKJV)</span>
                        <p className="monitor-text">
                            {verseNumber && <sup className="verse-number">{verseNumber}</sup>}
                            {activeItem.text}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ContentLibrary({ activeVerseId, setActiveVerseId, onOpenVersions }: any) {
    const selectRef = useRef<HTMLSelectElement>(null);

    const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (e.target.value === 'more') {
            onOpenVersions();
            if (selectRef.current) selectRef.current.value = 'NKJV';
        }
    };

    return (
        <div className="card-panel library-panel">
            <div className="library-toolbar">
                <div className="input-with-icon version-select-wrapper">
                    <select ref={selectRef} onChange={handleVersionChange} defaultValue="NKJV" className="custom-select small-select">
                        <option value="NKJV">NKJV</option>
                        <option value="NIV">NIV</option>
                        <option value="ESV">ESV</option>
                        <option value="KJV">KJV</option>
                        <option disabled>──────────</option>
                        <option value="more">View / Download more...</option>
                    </select>
                    <ChevronDown className="icon right-icon" />
                </div>
                <div className="input-with-icon search-wrapper">
                    <Search className="icon left-icon" />
                    <input type="text" className="search-input" placeholder="Search Bible verses or keywords..." defaultValue="Luke 1:17" />
                </div>
            </div>

            <div className="library-header sticky-header">
                <span className="chapter-title">Luke 1</span>
                <div className="nav-buttons">
                    <button className="icon-btn"><ChevronLeft className="icon" /></button>
                    <button className="icon-btn"><ChevronRight className="icon" /></button>
                </div>
            </div>

            <div className="verses-list scrollbar-hide">
                {verses.map((verse, index) => {
                    const isActive = verse.id === activeVerseId;
                    const isOdd = index % 2 !== 0;

                    if (isActive) {
                        return (
                            <div key={verse.id} className="verse-item active-verse" onClick={() => setActiveVerseId(verse.id)}>
                                <div className="active-line"></div>
                                <span className="verse-num">{verse.id}</span>
                                <p className="verse-text">{verse.text}</p>
                                <Check className="icon check-icon" />
                            </div>
                        );
                    }

                    return (
                        <div key={verse.id} className={`verse-item ${isOdd ? 'odd-row' : ''}`} onClick={() => setActiveVerseId(verse.id)}>
                            <span className="verse-num">{verse.id}</span>
                            <p className="verse-text">{verse.text}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function RightSidebar({ queue, setQueue, onPresentItem }: any) {
    const handleRemoveQueue = (id: string) => setQueue((prev: any) => prev.filter((item: any) => item.id !== id));
    const handleAddQueue = (ref: string) => setQueue((prev: any) => [{ id: `q${Date.now()}`, title: ref, type: 'Manual' }, ...prev]);

    return (
        <aside className="sidebar right-sidebar">
            <div className="card-panel queue-panel">
                <div className="card-header">
                    <h2 className="header-title">Queue <span className="badge">{queue.length}</span></h2>
                    <button className="clear-btn" onClick={() => setQueue([])}><X className="icon small-icon" /> Clear all</button>
                </div>
                <div className="queue-list scrollbar-hide">
                    {queue.map((item: any) => (
                        <div key={item.id} className={`queue-item ${item.active ? 'active-queue' : ''}`}>
                            <div className="queue-info">
                                <span className="queue-title">{item.title}</span>
                                <span className="queue-type">{item.type}</span>
                            </div>
                            <div className="queue-actions">
                                <button className="action-btn play-btn"><Play className="icon fill-icon" /></button>
                                <button className="action-btn remove-btn" onClick={() => handleRemoveQueue(item.id)}><X className="icon" /></button>
                            </div>
                        </div>
                    ))}
                    {queue.length === 0 && <div className="empty-message">Queue is empty</div>}
                </div>
            </div>

            <div className="card-panel detections-panel">
                <div className="card-header sticky-header no-bottom-border">
                    <h2 className="header-title">Recent detections</h2>
                    <button className="clear-btn"><X className="icon small-icon" /> Clear all</button>
                </div>
                <div className="detections-list scrollbar-hide">
                    {detections.map(det => (
                        <div key={det.id} className="detection-card">
                            <div className="detection-header">
                                <span className="error-dot"></span>
                                <span className="detection-ref">{det.reference}</span>
                            </div>
                            <p className="detection-text">{det.text}</p>
                            <div className="detection-actions">
                                <button className="btn btn-outline btn-sm" onClick={() => onPresentItem({ reference: det.reference, text: det.text })}>
                                    <Play className="icon small-icon fill-icon" /> Present
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => handleAddQueue(det.reference)}>
                                    <Plus className="icon small-icon" /> Queue
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}

const downloadedVersions = [
    { id: 'nkjv', name: 'New King James Version', abbr: 'NKJV', size: '14.2 MB' },
    { id: 'niv', name: 'New International Version', abbr: 'NIV', size: '15.1 MB' },
    { id: 'esv', name: 'English Standard Version', abbr: 'ESV', size: '13.8 MB' },
    { id: 'kjv', name: 'King James Version', abbr: 'KJV', size: '13.5 MB' },
];

const availableVersions = [
    { id: 'nlt', name: 'New Living Translation', abbr: 'NLT', size: '14.5 MB' },
    { id: 'asv', name: 'American Standard Version', abbr: 'ASV', size: '12.9 MB' },
    { id: 'csb', name: 'Christian Standard Bible', abbr: 'CSB', size: '15.0 MB' },
    { id: 'nasb', name: 'New American Standard Bible', abbr: 'NASB', size: '14.8 MB' },
    { id: 'amp', name: 'Amplified Bible', abbr: 'AMP', size: '16.2 MB' },
    { id: 'msg', name: 'The Message', abbr: 'MSG', size: '15.5 MB' },
];

function VersionModal({ isOpen, onClose }: any) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-container modal-large">
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">Bible Versions</h2>
                        <p className="modal-subtitle">Manage your downloaded translations</p>
                    </div>
                    <button className="icon-btn" onClick={onClose}><X className="icon" /></button>
                </div>

                <div className="modal-search">
                    <div className="input-with-icon full-width">
                        <Search className="icon left-icon" />
                        <input type="text" placeholder="Search versions..." className="search-input full-width" />
                    </div>
                </div>

                <div className="modal-content scrollbar-hide">
                    <section className="version-section">
                        <h3 className="section-title">Downloaded ({downloadedVersions.length})</h3>
                        <div className="version-list">
                            {downloadedVersions.map((v) => (
                                <div key={v.id} className="version-item installed">
                                    <div className="version-info">
                                        <div className="version-abbr">{v.abbr}</div>
                                        <div>
                                            <div className="version-name">{v.name} <span className="installed-dot"></span></div>
                                            <div className="version-meta">{v.size} • Installed</div>
                                        </div>
                                    </div>
                                    <button className="action-btn remove-btn" title="Remove"><Trash2 className="icon" /></button>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="version-section">
                        <h3 className="section-title">
                            Available to Download <span className="badge">{availableVersions.length}</span>
                        </h3>
                        <div className="version-list">
                            {availableVersions.map((v) => (
                                <div key={v.id} className="version-item available">
                                    <div className="version-info">
                                        <div className="version-abbr outline">{v.abbr}</div>
                                        <div>
                                            <div className="version-name">{v.name}</div>
                                            <div className="version-meta">{v.size}</div>
                                        </div>
                                    </div>
                                    <button className="btn btn-outline btn-sm"><Download className="icon small-icon" /> Download</button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="modal-footer split">
                    <div className="footer-info"><AlertCircle className="icon small-icon" /> Storage used: 56.6 MB</div>
                    <button className="btn btn-secondary" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
}

function StopTranscriptionModal({ isOpen, onConfirm, onCancel }: any) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-container modal-small">
                <div className="modal-body text-center">
                    <div className="alert-icon-wrapper"><AlertTriangle className="icon large-icon text-error" /></div>
                    <h2 className="modal-title mb-2">Stop Transcription?</h2>
                    <p className="modal-text">Are you sure you want to stop the live transcription? This will pause automated subtitle generation and scripture detection.</p>
                </div>
                <div className="modal-footer flex-end">
                    <button className="btn btn-text" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-danger" onClick={onConfirm}>Stop Transcription</button>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    const [activeVerseId, setActiveVerseId] = useState('17');
    const [queue, setQueue] = useState(initialQueue);
    const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(true);
    const [isStopModalOpen, setIsStopModalOpen] = useState(false);

    const defaultVerse = verses.find(v => v.id === activeVerseId) || verses[4];
    const [activeMonitorItem, setActiveMonitorItem] = useState<{ reference: string; text: string }>({
        reference: `Luke 1:${defaultVerse.id}`, text: defaultVerse.text
    });

    const handleSetActiveVerse = (id: string) => {
        setActiveVerseId(id);
        const verse = verses.find(v => v.id === id);
        if (verse) setActiveMonitorItem({ reference: `Luke 1:${verse.id}`, text: verse.text });
    };

    const handlePresentItem = (item: { reference: string; text: string }) => setActiveMonitorItem(item);

    return (
        <div className="app-root">
            <main className="app-main">
                <TranscriptSidebar isTranscribing={isTranscribing} onRequestStop={() => setIsStopModalOpen(true)} onStart={() => setIsTranscribing(true)} />
                <div className="center-column">
                    <Monitors activeItem={activeMonitorItem} />
                    <ContentLibrary activeVerseId={activeVerseId} setActiveVerseId={handleSetActiveVerse} onOpenVersions={() => setIsVersionModalOpen(true)} />
                </div>
                <RightSidebar queue={queue} setQueue={setQueue} onPresentItem={handlePresentItem} />
            </main>
            <VersionModal isOpen={isVersionModalOpen} onClose={() => setIsVersionModalOpen(false)} />
            <StopTranscriptionModal isOpen={isStopModalOpen} onCancel={() => setIsStopModalOpen(false)} onConfirm={() => { setIsTranscribing(false); setIsStopModalOpen(false); }} />
        </div>
    );
}
