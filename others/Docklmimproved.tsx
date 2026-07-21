import './Docklmimproved.css';
import { useState, useRef, useEffect } from 'react';
import { Copy, Edit2, MonitorUp, Check, HelpCircle, Settings } from 'lucide-react';
import BibleAiOnboarding, {
  isBibleAiOnboardingCompleted,
  resetBibleAiOnboarding,
} from './BibleAiOnboarding';

const initialTranscript = [
    "Create our world.",
    "Deep preach from Pastor.",
    "Amen. Come on, Fabian. Amen.",
    "Pray, Pastor, pray.",
    "For they shall dream dreams and see visions.",
    "They shall dream dreams and see visions.",
    "Doing this time, minds.",
    "Doing this time."
];

export default function App() {
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; index: number | null }>({
        visible: false,
        x: 0,
        y: 0,
        index: null,
    });
    const [editModal, setEditModal] = useState<{ visible: boolean; text: string }>({
        visible: false,
        text: '',
    });
    const clickTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        if (!isBibleAiOnboardingCompleted()) {
            setShowOnboarding(true);
        }
    }, []);

    const handleClickOutside = () => {
            if (contextMenu.visible) {
                setContextMenu(prev => ({ ...prev, visible: false }));
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [contextMenu.visible]);

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => {
            setToastMessage(null);
        }, 2000);
    };

    const handleContextMenu = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            index,
        });
    };

    const handleContextSelect = () => {
        if (contextMenu.index !== null) {
            setIsSelectionMode(true);
            const newSelection = new Set(selectedIndices);
            newSelection.add(contextMenu.index);
            setSelectedIndices(newSelection);
        }
    };

    const handleContextCopy = () => {
        if (contextMenu.index !== null) {
            navigator.clipboard.writeText(initialTranscript[contextMenu.index]);
            showToast('Copied to clipboard!');
        }
    };

    const handleContextEdit = () => {
        if (contextMenu.index !== null) {
            setEditModal({ visible: true, text: initialTranscript[contextMenu.index] });
        }
    };

    const handleContextPush = () => {
        showToast('Pushed to OBS');
    };

    const handleLineClick = (index: number) => {
        if (isSelectionMode) {
            const newSelection = new Set(selectedIndices);
            if (newSelection.has(index)) {
                newSelection.delete(index);
            } else {
                newSelection.add(index);
            }
            setSelectedIndices(newSelection);
        } else {
            if (clickTimeout.current) {
                clearTimeout(clickTimeout.current);
                clickTimeout.current = null;
                // Double click
                setIsSelectionMode(true);
                setSelectedIndices(new Set([index]));
                window.getSelection()?.removeAllRanges();
            } else {
                // Single click
                clickTimeout.current = setTimeout(() => {
                    navigator.clipboard.writeText(initialTranscript[index]);
                    showToast('Copied to clipboard!');
                    clickTimeout.current = null;
                }, 250);
            }
        }
    };

    const handleCheckboxChange = (index: number, checked: boolean) => {
        const newSelection = new Set(selectedIndices);
        if (checked) newSelection.add(index);
        else newSelection.delete(index);
        setSelectedIndices(newSelection);
    };

    const handleCancel = () => {
        setIsSelectionMode(false);
        setSelectedIndices(new Set());
    };

    const handleCopyAll = () => {
        const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
        const text = sorted.map(idx => initialTranscript[idx]).join('\n');
        navigator.clipboard.writeText(text);
        showToast(`Copied ${selectedIndices.size} lines`);
        handleCancel();
    };

    const handleEditAll = () => {
        const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
        const text = sorted.map(idx => initialTranscript[idx]).join('\n');
        setEditModal({ visible: true, text });
    };

    const maxSelectedIndex = selectedIndices.size > 0 ? Math.max(...Array.from(selectedIndices)) : -1;

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-left">
                    <h1 className="header-title">
                        <svg className="icon-header" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                        </svg>
                        Transcript
                    </h1>
                    <span className="badge-live">Live</span>
                </div>
                <div className="header-right">
                    <button
                        className="header-help-btn"
                        onClick={() => {
                            resetBibleAiOnboarding();
                            setShowOnboarding(true);
                        }}
                        title="Bible AI Help & Tour"
                    >
                        <HelpCircle size={16} />
                    </button>
                    <button
                        className="header-settings-btn"
                        onClick={() => {
                            /* Opens Bible AI settings – integrated later */
                        }}
                        title="Bible AI Settings"
                    >
                        <Settings size={16} />
                    </button>
                </div>
            </header>

            <main className="transcript-main">
                <div className="transcript-list">
                    {initialTranscript.map((text, index) => {
                        const isSelected = selectedIndices.has(index);
                        const showActionBar = isSelectionMode && index === maxSelectedIndex;

                        return (
                            <div
                                key={index}
                                className={`transcript-item ${isSelected ? 'selected' : ''} ${isSelectionMode ? 'selection-mode' : ''} ${showActionBar ? 'has-action-bar' : ''}`}
                                onClick={(e) => {
                                    if ((e.target as HTMLElement).closest('.action-bar')) return;
                                    if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
                                    handleLineClick(index);
                                }}
                                onContextMenu={(e) => handleContextMenu(e, index)}
                            >
                                <div className="transcript-line">
                                    <div className={`checkbox-container ${isSelectionMode ? 'visible' : ''}`}>
                                        <input
                                            type="checkbox"
                                            className="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => handleCheckboxChange(index, e.target.checked)}
                                        />
                                    </div>
                                    <div className="text-content">
                                        {text}
                                    </div>
                                    {!isSelectionMode && (
                                        <div className="tooltip">Click to copy</div>
                                    )}
                                </div>

                                {showActionBar && (
                                    <div className="action-bar">
                                        <div className="action-left">
                                            <span className="selection-count">{selectedIndices.size} selected</span>
                                            <button className="btn-cancel" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>Cancel</button>
                                        </div>
                                        <div className="action-right">
                                            <button className="btn-action" onClick={(e) => { e.stopPropagation(); handleCopyAll(); }} title="Copy All">
                                                <Copy size={16} /> <span className="btn-text">Copy All</span>
                                            </button>
                                            <button className="btn-action" onClick={(e) => { e.stopPropagation(); handleEditAll(); }} title="Edit">
                                                <Edit2 size={16} /> <span className="btn-text">Edit</span>
                                            </button>
                                            <button className="btn-primary" onClick={(e) => { e.stopPropagation(); showToast('Pushed to OBS'); }} title="Push to OBS">
                                                <MonitorUp size={16} /> <span className="btn-text">Push to OBS</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </main>

            <div className={`toast ${toastMessage ? 'visible' : ''}`}>
                <Check size={16} className="toast-icon" />
                <span>{toastMessage}</span>
            </div>

            {contextMenu.visible && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()} // Prevent closing immediately if they somehow click inside
                >
                    <button className="context-menu-item" onClick={(e) => { handleContextSelect(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                        Select
                    </button>
                    <button className="context-menu-item" onClick={(e) => { handleContextCopy(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                        Copy
                    </button>
                    <button className="context-menu-item" onClick={(e) => { handleContextEdit(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                        Edit
                    </button>
                    <button className="context-menu-item" onClick={(e) => { handleContextPush(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                        Push to OBS
                    </button>
                </div>
            )}

            {editModal.visible && (
                <div className="modal-overlay" onClick={() => setEditModal({ visible: false, text: '' })}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                <Edit2 size={18} className="text-blue-500" /> Edit Selection
                            </h2>
                            <button className="modal-close" onClick={() => setEditModal({ visible: false, text: '' })}>
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <label className="modal-label">Content to edit</label>
                            <textarea
                                className="modal-textarea"
                                rows={6}
                                value={editModal.text}
                                onChange={(e) => setEditModal(prev => ({ ...prev, text: e.target.value }))}
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={() => setEditModal({ visible: false, text: '' })}>Cancel</button>
                            <button className="btn-secondary" onClick={() => { showToast('Saved to Notes'); setEditModal({ visible: false, text: '' }); }}>Save to Notes</button>
                            <button className="btn-primary" onClick={() => { showToast('Pushed to OBS'); setEditModal({ visible: false, text: '' }); }}>
                                Push to OBS
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <BibleAiOnboarding
                isOpen={showOnboarding}
                onClose={() => setShowOnboarding(false)}
            />
        </div>
    );
}
