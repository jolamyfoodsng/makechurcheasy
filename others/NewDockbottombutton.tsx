import { useState } from 'react';
import { Image, Clipboard, PenLine, ChevronUp, ChevronDown } from 'lucide-react';
import './NewDockbottombutton.css';
export default function App() {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className={`widget-container ${isExpanded ? 'widget-expanded' : 'widget-collapsed'}`}>
            {isExpanded ? (
                <div className="toolbar-grid">
                    <div className="mode-toggle">
                        <button className="mode-btn mode-btn-full">
                            Full
                        </button>
                        <button className="mode-btn mode-btn-lt">
                            LT
                        </button>
                    </div>
                    <button className="toolbar-btn icon-img">
                        <Image size={18} />
                    </button>
                    <button className="toolbar-btn icon-clip">
                        <Clipboard size={18} />
                    </button>
                    <button className="toolbar-btn icon-pen">
                        <PenLine size={18} />
                    </button>
                    <button
                        onClick={() => setIsExpanded(false)}
                        className="toolbar-btn icon-collapse"
                    >
                        <ChevronDown size={18} />
                    </button>
                    <button className="clear-btn-grid">
                        Clear
                    </button>
                </div>
            ) : (
                <div className="collapsed-row">
                    <button className="clear-btn collapsed-clear">
                        Clear
                    </button>
                    <button
                        onClick={() => setIsExpanded(true)}
                        className="toolbar-btn collapsed-expand"
                    >
                        <ChevronUp size={18} />
                    </button>
                </div>
            )}
        </div>
    );
}
