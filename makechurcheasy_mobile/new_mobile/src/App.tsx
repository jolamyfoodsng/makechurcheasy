import React, { useState } from 'react';
import {
  Layers, BookOpen, Music, Church, Video,
  User, Search, Play, Square, MoreVertical,
  Mic, Star, Eye, Send, SkipBack, SkipForward,
  ChevronRight, Activity, AlertTriangle,
  CheckCircle, MonitorUp, Menu, RefreshCw,
  Image as ImageIcon, Type, Palette, MoreHorizontal, Copy,
  Globe, Edit2, ChevronDown
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('scenes');
  const [isAutomationOpen, setIsAutomationOpen] = useState(false);
  const [automationTab, setAutomationTab] = useState('rules');
  const [bibleTab, setBibleTab] = useState('verseAI');
  const [ministryTab, setMinistryTab] = useState('ticker');
  const [aiListening, setAiListening] = useState(true);
  const [activeSong, setActiveSong] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<number>(3);

  const worshipLibrary = [
    { id: '1', title: 'Way Maker', slides: 4, artist: 'Sinach' },
    { id: '2', title: 'Goodness of God', slides: 6, artist: 'Bethel Music' },
    { id: '3', title: 'Holy Forever', slides: 5, artist: 'Chris Tomlin' },
    { id: '4', title: 'Build My Life', slides: 7, artist: 'Housefires' },
    { id: '5', title: 'Trust In God', slides: 4, artist: 'Elevation Worship' },
    { id: '6', title: 'Great Is Thy Faithfulness', slides: 5, artist: 'Traditional' },
  ];

  const renderHeader = () => {
    const titleMap: Record<string, string> = {
      scenes: 'Scenes',
      bible: 'Bible',
      worship: 'Worship',
      ministry: 'Ministry',
      media: 'Media'
    };
    return (
      <header className="top-bar" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '6px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <Menu size={18} />
          </button>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            MCE Studio <span style={{ color: 'white' }}>/ {titleMap[activeTab] || 'Studio'}</span>
          </div>
        </div>
        <button style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '6px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={16} />
        </button>
      </header>
    );
  };

  const renderNav = () => (
    <nav className="bottom-nav">
      <button className={`nav-btn ${activeTab === 'scenes' && !isAutomationOpen ? 'active' : ''}`} onClick={() => { setActiveTab('scenes'); setIsAutomationOpen(false); }}>
        <Layers size={24} />
        Scenes
      </button>
      <button className={`nav-btn ${activeTab === 'bible' && !isAutomationOpen ? 'active' : ''}`} onClick={() => { setActiveTab('bible'); setIsAutomationOpen(false); }}>
        <BookOpen size={24} />
        Bible
      </button>
      <button className={`nav-btn ${activeTab === 'worship' && !isAutomationOpen ? 'active' : ''}`} onClick={() => { setActiveTab('worship'); setIsAutomationOpen(false); }}>
        <Music size={24} />
        Worship
      </button>
      <button className={`nav-btn ${activeTab === 'ministry' && !isAutomationOpen ? 'active' : ''}`} onClick={() => { setActiveTab('ministry'); setIsAutomationOpen(false); }}>
        <Church size={24} />
        Ministry
      </button>
      <button className={`nav-btn ${activeTab === 'media' && !isAutomationOpen ? 'active' : ''}`} onClick={() => { setActiveTab('media'); setIsAutomationOpen(false); }}>
        <Video size={24} />
        Media
      </button>
    </nav>
  );

  const renderScenes = () => (
    <div className="main-content">
      <div className="quick-actions-row">
        <button className="quick-action-btn primary" onClick={() => setIsAutomationOpen(true)}><Activity size={14} /> Automation</button>
        <button className="quick-action-btn success"><Play size={14} /> Stream</button>
        <button className="quick-action-btn danger"><Square size={14} /> Record</button>
      </div>

      <div className="monitors-container">
        <div className="monitor-card preview">
          <div className="monitor-thumb">
            <div className="badge badge-preview">PREVIEW</div>
            <img src="https://images.unsplash.com/photo-1438283173091-5dbf5c5a3206?auto=format&fit=crop&q=80&w=400" alt="Worship Wide" />
          </div>
          <div className="monitor-info">
            <h4>Worship Wide</h4>
            <p>Tap to Preview</p>
          </div>
        </div>

        <div className="monitor-card live">
          <div className="monitor-thumb">
            <div className="badge badge-live">LIVE</div>
            <img src="https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&q=80&w=400" alt="Sermon" />
          </div>
          <div className="monitor-info">
            <h4>Sermon + Lower Third</h4>
            <p>Sermon</p>
          </div>
        </div>
      </div>

      <div className="section-header" style={{ marginBottom: '8px' }}>
        <h2 className="section-title" style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Automation Shortcuts</h2>
      </div>
      <div className="quick-actions-row" style={{ marginBottom: '20px' }}>
        <button className="quick-action-btn success"><CheckCircle size={14} /> Auto-Switch</button>
        <button className="quick-action-btn"><AlertTriangle size={14} /> Alerts Muted</button>
      </div>

      <div className="section-header">
        <h2 className="section-title">Scene Switcher</h2>
      </div>

      <div className="grid-2">
        <div className="scene-grid-item live">
          <div className="scene-grid-thumb">
            <div className="badge badge-live">LIVE</div>
            <img src="https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&q=80&w=400" alt="Sermon" />
          </div>
          <div className="scene-grid-info">
            <h4>Sermon + Lower Third</h4>
            <p>Active</p>
          </div>
        </div>
        <div className="scene-grid-item preview">
          <div className="scene-grid-thumb">
            <div className="badge badge-preview">PREVIEW</div>
            <img src="https://images.unsplash.com/photo-1438283173091-5dbf5c5a3206?auto=format&fit=crop&q=80&w=400" alt="Worship Wide" />
          </div>
          <div className="scene-grid-info">
            <h4>Worship Wide</h4>
            <p>Ready</p>
          </div>
        </div>
        <div className="scene-grid-item">
          <div className="scene-grid-thumb">
            <img src="https://images.unsplash.com/photo-1470229722913-7c090be5c520?auto=format&fit=crop&q=80&w=400" alt="Worship Close" />
          </div>
          <div className="scene-grid-info">
            <h4>Worship Close</h4>
            <p>Ready</p>
          </div>
        </div>
        <div className="scene-grid-item">
          <div className="scene-grid-thumb">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', background: 'var(--bg-3)' }}><Church size={32} /></div>
          </div>
          <div className="scene-grid-info">
            <h4>MCE Ticker Scene</h4>
            <p>Ready</p>
          </div>
        </div>
      </div>

      <div className="section-header" style={{ marginTop: '8px' }}>
        <h2 className="section-title">Macros</h2>
      </div>

      <div className="macro-grid">
        <button className="macro-btn">
          <div style={{ color: 'var(--success)' }}><Play size={18} /></div>
          Start Service
        </button>
        <button className="macro-btn">
          <div style={{ color: 'var(--primary)' }}><Music size={18} /></div>
          Worship Setup
        </button>
        <button className="macro-btn">
          <div style={{ color: 'var(--text-secondary)' }}><User size={18} /></div>
          Show BRB
        </button>
        <button className="macro-btn">
          <div style={{ color: 'var(--success)' }}><CheckCircle size={18} /></div>
          Go Safe
        </button>
        <button className="macro-btn">
          <div style={{ color: 'var(--danger)' }}><AlertTriangle size={18} /></div>
          Emergency Reset
        </button>
        <button className="macro-btn">
          <div style={{ color: 'var(--secondary)' }}><Play size={18} /></div>
          Restart Stream
        </button>
      </div>
    </div>
  );

  const renderAutomation = () => (
    <div className="main-content">
      <div className="section-header">
        <div>
          <button onClick={() => setIsAutomationOpen(false)} style={{ background: 'none', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <SkipBack size={14} /> Back to Scenes
          </button>
          <h2 className="section-title">Automation</h2>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${automationTab === 'rules' ? 'active' : ''}`} onClick={() => setAutomationTab('rules')}>Rules</button>
        <button className={`tab ${automationTab === 'macros' ? 'active' : ''}`} onClick={() => setAutomationTab('macros')}>Macros</button>
        <button className={`tab ${automationTab === 'executions' ? 'active' : ''}`} onClick={() => setAutomationTab('executions')}>Executions</button>
      </div>

      {automationTab === 'rules' && (
        <>
          <div className="card rule-card">
            <div className="rule-header">
              <div>
                <div className="rule-title">Camera Source Lost</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>CRITICAL</span>
                  <span style={{ fontSize: '10px', background: 'var(--bg-3)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>STARTER</span>
                </div>
              </div>
              <div className="toggle-switch active">
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="rule-desc">If a camera source is unavailable for 5s, then show an operator alert and switch to back-up scene.</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}><AlertTriangle size={12} /> Show Alert</button>
              <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}>Cooldown 30s</button>
            </div>
          </div>

          <div className="card rule-card">
            <div className="rule-header">
              <div>
                <div className="rule-title">Dropped Frames High</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '10px', background: 'rgba(34, 197, 94, 0.2)', color: 'var(--success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>HEALTH</span>
                </div>
              </div>
              <div className="toggle-switch active">
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="rule-desc">If dropped frames stay above 5% for 10s, then show an operator alert to lower bitrate.</div>
          </div>
        </>
      )}

      {automationTab === 'macros' && (
        <>
          <div className="list-item" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div className="btn-icon" style={{ background: 'rgba(124, 58, 237, 0.1)', color: 'var(--primary)' }}>
                <Play size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Restart Stream</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Stop Stream → Delay 10s → Start Stream</div>
              </div>
            </div>
            <button className="btn btn-primary" style={{ padding: '8px', borderRadius: '50%' }}><Play size={16} /></button>
          </div>
          <div className="list-item" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div className="btn-icon">
                <Square size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Emergency Reset</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Stop Recording → Stop Stream</div>
              </div>
            </div>
            <button className="btn btn-primary" style={{ padding: '8px', borderRadius: '50%' }}><Play size={16} /></button>
          </div>
        </>
      )}

      {automationTab === 'executions' && (
        <>
          <div className="list-item">
            <div style={{ color: 'var(--success)' }}><CheckCircle size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Restart Stream</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Macro executed</div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>10:42 AM</div>
          </div>
          <div className="list-item">
            <div style={{ color: 'var(--danger)' }}><AlertTriangle size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Camera Source Lost</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Rule triggered</div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>10:35 AM</div>
          </div>
        </>
      )}
    </div>
  );

  const renderBible = () => (
    <div className="main-content" style={{ paddingBottom: bibleTab === 'reading' ? '140px' : '100px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
          <input type="text" className="input-field" placeholder="Search verses..." style={{ paddingLeft: '32px', padding: '8px 8px 8px 32px', fontSize: '13px' }} />
        </div>
        <select className="input-field" style={{ width: '80px', padding: '8px', fontSize: '13px' }}>
          <option>KJV</option>
          <option>NIV</option>
          <option>ESV</option>
        </select>
        <button className="btn-icon" style={{ borderRadius: '8px' }}><BookOpen size={16} /></button>
      </div>

      <div className="tabs">
        <button className={`tab ${bibleTab === 'reading' ? 'active' : ''}`} onClick={() => setBibleTab('reading')}>Reading</button>
        <button className={`tab ${bibleTab === 'verseAI' ? 'active' : ''}`} onClick={() => setBibleTab('verseAI')}>Verse AI</button>
        <button className={`tab ${bibleTab === 'history' ? 'active' : ''}`} onClick={() => setBibleTab('history')}>History</button>
      </div>

      {bibleTab === 'reading' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '1px' }}>READING</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>John 3</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>KJV</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
            <div className={`verse-item ${selectedVerse === 1 ? 'selected' : ''}`} onClick={() => setSelectedVerse(1)}>
              <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold', marginTop: '3px' }}>1</span>
              <span style={{ fontSize: '14px', lineHeight: 1.5 }}>There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:</span>
            </div>
            <div className={`verse-item ${selectedVerse === 2 ? 'selected' : ''}`} onClick={() => setSelectedVerse(2)}>
              <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold', marginTop: '3px' }}>2</span>
              <span style={{ fontSize: '14px', lineHeight: 1.5 }}>The same came to Jesus by night, and said unto him, Rabbi, we know that thou art a teacher come from God: for no man can do these miracles that thou doest, except God be with him.</span>
            </div>
            <div className={`verse-item ${selectedVerse === 3 ? 'selected' : ''}`} onClick={() => setSelectedVerse(3)}>
              <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold', marginTop: '3px' }}>3</span>
              <span style={{ fontSize: '14px', lineHeight: 1.5 }}>Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.</span>
            </div>
            <div className={`verse-item ${selectedVerse === 4 ? 'selected' : ''}`} onClick={() => setSelectedVerse(4)}>
              <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold', marginTop: '3px' }}>4</span>
              <span style={{ fontSize: '14px', lineHeight: 1.5 }}>Nicodemus saith unto him, How can a man be born when he is old? can he enter the second time into his mother's womb, and be born?</span>
            </div>
            <div className={`verse-item ${selectedVerse === 5 ? 'selected' : ''}`} onClick={() => setSelectedVerse(5)}>
              <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold', marginTop: '3px' }}>5</span>
              <span style={{ fontSize: '14px', lineHeight: 1.5 }}>Jesus answered, Verily, verily, I say unto thee, Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God.</span>
            </div>
          </div>
        </div>
      )}

      {bibleTab === 'verseAI' && (
        <>
          <div className="card" style={{ textAlign: 'center', borderColor: aiListening ? 'var(--primary)' : 'var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>VERSE AI ACTIVE</div>
              <button onClick={() => setAiListening(!aiListening)}>
                <Mic size={20} color={aiListening ? 'var(--primary)' : 'var(--text-secondary)'} />
              </button>
            </div>

            {aiListening ? (
              <div className="ai-vis">
                <div className="ai-bar" style={{ animationDelay: '0.1s' }}></div>
                <div className="ai-bar" style={{ animationDelay: '0.3s' }}></div>
                <div className="ai-bar" style={{ animationDelay: '0.2s' }}></div>
                <div className="ai-bar" style={{ animationDelay: '0.5s' }}></div>
                <div className="ai-bar" style={{ animationDelay: '0.2s' }}></div>
                <div className="ai-bar" style={{ animationDelay: '0.4s' }}></div>
              </div>
            ) : (
              <div style={{ padding: '16px', color: 'var(--text-secondary)' }}>Listening paused</div>
            )}
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '12px' }}>
              Listening for scripture references...
            </div>
          </div>

          <h3 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-secondary)' }}>Queue</h3>
          <div className="list-item">
            <div style={{ background: 'var(--bg-3)', padding: '6px', borderRadius: '4px' }}><Activity size={14} color="var(--primary)" /></div>
            <div style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>John 3:16</div>
            <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}>Push Live</button>
          </div>
          <div className="list-item">
            <div style={{ background: 'var(--bg-3)', padding: '6px', borderRadius: '4px' }}><Activity size={14} color="var(--text-secondary)" /></div>
            <div style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>Romans 8:28</div>
            <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}>Push Live</button>
          </div>
          <div className="list-item">
            <div style={{ background: 'var(--bg-3)', padding: '6px', borderRadius: '4px' }}><Activity size={14} color="var(--text-secondary)" /></div>
            <div style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>Psalm 23</div>
            <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}>Push Live</button>
          </div>
        </>
      )}

      {bibleTab === 'history' && (
        <>
          <div className="list-item">
            <div style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>John 3:16</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>10:45 AM</div>
          </div>
          <div className="list-item">
            <div style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>Psalm 23</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>10:30 AM</div>
          </div>
          <div className="list-item">
            <div style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>Romans 8</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>10:15 AM</div>
          </div>
        </>
      )}

      {bibleTab === 'reading' && (
        <div style={{ position: 'fixed', bottom: '74px', left: 0, right: 0, background: 'var(--bg-2)', borderTop: '1px solid var(--border)', padding: '12px 16px', zIndex: 9, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--bg-3)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', background: 'var(--primary)', color: 'white' }}>Full</button>
              <button style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>LT</button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-icon" style={{ background: 'var(--bg-3)', width: '32px', height: '32px', padding: 0 }}><ImageIcon size={14} /></button>
              <button className="btn-icon" style={{ background: 'var(--bg-3)', width: '32px', height: '32px', padding: 0 }}><Type size={14} /></button>
              <button className="btn-icon" style={{ background: 'var(--bg-3)', width: '32px', height: '32px', padding: 0 }}><Palette size={14} /></button>
              <button className="btn-icon" style={{ background: 'var(--bg-3)', width: '32px', height: '32px', padding: 0 }}><MoreHorizontal size={14} /></button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline" style={{ flex: 1, padding: '8px' }}><Eye size={16} /> Preview</button>
            <button className="btn btn-primary" style={{ flex: 1, padding: '8px' }}><Send size={16} /> Push Live</button>
            <button className="btn btn-danger" style={{ flex: 0, padding: '8px 16px' }}><Square size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );

  const renderWorship = () => {
    const song = activeSong ? worshipLibrary.find(s => s.id === activeSong) : null;

    if (!song) {
      return (
        <div className="main-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '1px' }}>SEARCH SONGS</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}><Globe size={14} /> Import from URL</button>
              <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}>+ Add Song</button>
            </div>
          </div>
          <div style={{ marginBottom: '16px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-secondary)' }} />
            <input type="text" className="input-field" placeholder="Search songs..." style={{ paddingLeft: '36px', padding: '8px', fontSize: '13px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {worshipLibrary.map(s => (
              <div key={s.id} className="list-item" onClick={() => setActiveSong(s.id)} style={{ cursor: 'pointer', padding: '12px 16px', display: 'block' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{s.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {s.artist || 'Unknown Artist'}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Mock slides based on count
    const slides = Array.from({ length: song.slides }).map((_, i) => ({
      id: i,
      label: `Slide ${i + 1}`,
      number: i + 1,
      content: i === 0 ? "Help me to watch and pray, And on Thyself rely," :
        i === 1 ? "Assured, if I my trust betray, I shall for ever die." :
          i === 2 ? "Charles Wesley MHB 578" :
            `${i + 1}`
    }));

    return (
      <div className="main-content" style={{ paddingBottom: '140px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', background: 'var(--bg-3)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <button onClick={() => setActiveSong(null)} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <SkipBack size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>{song.title},</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{song.slides} slides • {song.artist || 'Lines per slide (3)'}</p>
          </div>
          <button style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <Edit2 size={14} />
          </button>
        </div>

        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-secondary)' }} />
          <input type="text" className="input-field" placeholder="Search lyrics..." style={{ paddingLeft: '36px', padding: '8px', fontSize: '13px' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          {slides.map(slide => (
            <div key={slide.id} className="card" style={{ padding: '12px', border: '1px solid var(--border)', background: 'var(--bg-3)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {slide.label} <span style={{ color: 'var(--text-secondary)', opacity: 0.5, marginLeft: '4px' }}>{slide.number}</span>
                </div>
                {slide.id === 0 && (
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px' }}>
                    <Eye size={12} /> SHOW SECTION
                  </div>
                )}
                {slide.id === 3 && (
                  <div style={{ background: 'var(--bg-2)', padding: '4px', borderRadius: '4px' }}>
                    <Edit2 size={10} color="var(--text-secondary)" />
                  </div>
                )}
              </div>
              <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                {slide.content}
              </div>
            </div>
          ))}
        </div>

        <div style={{ position: 'fixed', bottom: '74px', left: 0, right: 0, background: 'var(--bg-2)', borderTop: '1px solid var(--border)', padding: '12px 16px', zIndex: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-3)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', background: 'var(--primary)', color: 'white' }}>Full</button>
            <button style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>LT</button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-icon" style={{ background: 'var(--bg-3)', width: '32px', height: '32px', padding: 0 }}><Eye size={14} /></button>
            <button className="btn-icon" style={{ background: 'var(--bg-3)', width: '32px', height: '32px', padding: 0 }}><Type size={14} /></button>
            <button className="btn-icon" style={{ background: 'var(--bg-3)', width: '32px', height: '32px', padding: 0 }}><Edit2 size={14} /></button>
            <button className="btn-icon" style={{ background: 'var(--bg-3)', width: '32px', height: '32px', padding: 0 }}><ChevronDown size={14} /></button>
            <button className="btn-icon" style={{ background: 'var(--danger)', width: 'auto', padding: '0 12px', height: '32px', fontSize: '11px', fontWeight: 'bold', color: 'white', borderRadius: '6px' }}>Hide Bible</button>
          </div>
        </div>
      </div>
    );
  };

  const renderMinistry = () => (
    <div className="main-content">
      <div className="tabs">
        <button className={`tab ${ministryTab === 'ticker' ? 'active' : ''}`} onClick={() => setMinistryTab('ticker')}>Ticker</button>
        <button className={`tab ${ministryTab === 'lowerThirds' ? 'active' : ''}`} onClick={() => setMinistryTab('lowerThirds')}>Lower Thirds</button>
      </div>

      {ministryTab === 'ticker' && (
        <>
          <div className="card">
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Select Ticker</label>
            <select className="input-field" style={{ marginTop: '8px' }}>
              <option>Welcome Message</option>
              <option>Special Announcement</option>
            </select>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Speed</div>
              <div style={{ fontSize: '12px', color: 'var(--primary)' }}>80%</div>
            </div>
            <input type="range" style={{ width: '100%', marginTop: '8px', accentColor: 'var(--primary)' }} />
          </div>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '20px 0 12px 0' }}>Messages</h3>
          <div className="list-item" style={{ background: 'var(--bg-3)' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--primary)' }} />
            <div style={{ flex: 1, fontSize: '14px' }}>Welcome to our Sunday Service!</div>
            <MoreVertical size={16} color="var(--text-secondary)" />
          </div>
          <div className="list-item" style={{ background: 'var(--bg-3)' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--primary)' }} />
            <div style={{ flex: 1, fontSize: '14px' }}>Don't forget to like & subscribe.</div>
            <MoreVertical size={16} color="var(--text-secondary)" />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button className="btn btn-success" style={{ flex: 1 }}><Play size={16} /> Show</button>
            <button className="btn btn-danger" style={{ flex: 1 }}><Square size={16} /> Clear</button>
          </div>
        </>
      )}

      {ministryTab === 'lowerThirds' && (
        <>
          <div className="memory-slot">
            <div className="memory-thumb">
              <div className="memory-lower"></div>
            </div>
            <div className="memory-info">
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Slot 01</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>Pastor John</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Guest Speaker</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }}>Push</button>
              <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}>Clear</button>
            </div>
          </div>

          <div className="memory-slot">
            <div className="memory-thumb">
              <div className="memory-lower" style={{ background: 'var(--secondary)' }}></div>
            </div>
            <div className="memory-info">
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Slot 02</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>Announcements</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Church News</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }}>Push</button>
              <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }}>Clear</button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderMedia = () => (
    <div className="main-content">
      <div className="section-header">
        <div>
          <h2 className="section-title">Media Library</h2>
          <div className="section-subtitle">Manage broadcast assets</div>
        </div>
      </div>

      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
        <input type="text" className="input-field" placeholder="Search media..." style={{ paddingLeft: '38px' }} />
      </div>

      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' }}>
        <button className="btn btn-primary" style={{ borderRadius: '20px', padding: '6px 16px', whiteSpace: 'nowrap' }}>All</button>
        <button className="btn btn-outline" style={{ borderRadius: '20px', padding: '6px 16px', whiteSpace: 'nowrap' }}>Images</button>
        <button className="btn btn-outline" style={{ borderRadius: '20px', padding: '6px 16px', whiteSpace: 'nowrap' }}>Videos</button>
        <button className="btn btn-outline" style={{ borderRadius: '20px', padding: '6px 16px', whiteSpace: 'nowrap' }}>Animations</button>
      </div>

      <div className="media-grid">
        <div className="media-card">
          <div className="media-thumb">
            <div className="badge" style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--secondary)' }}>MP4</div>
            <div style={{ position: 'absolute', bottom: '8px', right: '8px', fontSize: '10px', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px' }}>04:12</div>
            <img src="https://images.unsplash.com/photo-1438283173091-5dbf5c5a3206?auto=format&fit=crop&q=80&w=400" alt="Video" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div className="media-info">
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Sunday_Opening_Loop</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>1920x1080 • 124MB</div>
            </div>
            <button style={{ color: 'var(--text-secondary)' }}><Eye size={18} /></button>
          </div>
        </div>

        <div className="media-card">
          <div className="media-thumb">
            <div className="badge" style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--primary)' }}>PNG</div>
            <img src="https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&q=80&w=400" alt="Image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div className="media-info">
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Main_Church_Logo</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>2048x2048 • 1.2MB</div>
            </div>
            <button style={{ color: 'var(--text-secondary)' }}><Eye size={18} /></button>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '32px', padding: '24px', border: '1px dashed var(--border)', borderRadius: '12px' }}>
        <MonitorUp size={32} color="var(--text-secondary)" style={{ margin: '0 auto 12px auto' }} />
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Desktop Upload Only</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Media uploads are managed via the desktop app.</div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {renderHeader()}
      {isAutomationOpen ? renderAutomation() :
        activeTab === 'scenes' ? renderScenes() :
          activeTab === 'bible' ? renderBible() :
            activeTab === 'worship' ? renderWorship() :
              activeTab === 'ministry' ? renderMinistry() :
                renderMedia()
      }
      {renderNav()}
    </div>
  );
}
