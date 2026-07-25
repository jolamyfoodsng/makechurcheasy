import React from 'react';
import { Link, Copy, HelpCircle, Lock } from 'lucide-react';
import './ConnectionUrls.css';

export function ConnectionUrls() {
    return (
        <section className="urls-section" data-purpose="connection-urls">
            <div className="urls-header">
                <Link className="urls-header-icon" />
                <div>
                    <h2 className="urls-title">Dock Connection URLs</h2>
                    <p className="urls-subtitle">Connect your apps to MakeChurchEasy Dock</p>
                </div>
            </div>

            {/* URL 1 */}
            <div className="url-group">
                <label className="url-label-block">
                    <span className="url-label-text text-indigo">MakeChurchEasy Dock URL (App Connection)</span>
                    <p className="url-label-desc">Use this URL to connect external apps (OBS, mobile apps, tools) to your MakeChurchEasy Dock.</p>
                    <div className="url-input-group">
                        <input
                            readOnly
                            className="url-input input-indigo"
                            type="text"
                            value="http://192.168.1.45:9090"
                        />
                        <button className="url-btn btn-indigo">
                            <Copy className="url-btn-icon" />
                            Copy
                        </button>
                    </div>
                </label>
            </div>

            {/* URL 2 */}
            <div className="url-group">
                <label className="url-label-block">
                    <span className="url-label-text text-green">LLM Service URL (AI / Voice Processing)</span>
                    <p className="url-label-desc">Use this URL for AI services, voice processing, and scripture understanding (LLM Engine).</p>
                    <div className="url-input-group">
                        <input
                            readOnly
                            className="url-input input-green"
                            type="text"
                            value="http://192.168.1.45:11434"
                        />
                        <button className="url-btn btn-green">
                            <Copy className="url-btn-icon" />
                            Copy
                        </button>
                    </div>
                </label>
            </div>

            {/* Info Box */}
            <div className="urls-info-box">
                <div className="urls-info-header">
                    <HelpCircle className="urls-info-icon" />
                    <span className="urls-info-title">What do these URLs do?</span>
                </div>
                <ul className="urls-info-list">
                    <li>Dock URL: Allows other applications to send commands, receive updates, and control MakeChurchEasy features.</li>
                    <li>LLM URL: Powers voice understanding, Bible search, verse matching, and AI responses.</li>
                </ul>
                <div className="urls-info-footer">
                    <Lock className="urls-info-footer-icon" />
                    These URLs are local and secure. Keep them private.
                </div>
            </div>
        </section>
    );
}
