
<div className="modal-overlay">
    {/* Background Selection Modal */}
    <div className="modal-container">
        {/* Modal Header */}
        <div className="modal-header">
            <h2 className="modal-title">Background</h2>
            <button
                onClick={() => setIsModalOpen(false)}
                className="modal-close-btn"
            >
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Modal Tabs */}
        <div className="modal-tabs-container">
            <nav className="modal-tabs-nav">
                <button className="modal-tab-btn">My Images</button>
                <button className="modal-tab-btn">My Videos</button>
                <button className="modal-tab-btn">Images</button>
                {/* Active Tab */}
                <button className="modal-tab-btn active">
                    Patterns
                </button>
                {/* <button className="modal-tab-btn">Animations</button> */}
                <button className="modal-tab-btn">Color</button>
                <button className="modal-tab-btn">Transparent</button>
            </nav>
        </div>

        {/* Modal Content - Patterns Grid */}
        <div className="modal-body">
            {/* Search / Filter (Optional contextual addition) */}
            <div className="modal-search-row">
                <div className="modal-search-wrapper">
                    <Search className="modal-search-icon" />
                    <input
                        className="modal-input"
                        placeholder="Search patterns..."
                        type="text"
                    />
                </div>
                <button className="modal-filter-btn">
                    <SlidersHorizontal className="w-4 h-4" /> Filter
                </button>
            </div>

            <div className="modal-grid">
                {PATTERNS.map((src, index) => {
                    const isSelected = selectedPatternIndex === index;

                    if (isSelected) {
                        return (
                            /* Pattern Item (Selected State) */
                            <div key={index} className="pattern-item selected">
                                <img alt={`Pattern preview ${index}`} className="pattern-img" src={src} />
                                <div className="pattern-check-wrapper">
                                    <Check className="pattern-check-icon" strokeWidth={3} />
                                </div>
                            </div>
                        );
                    }

                    return (
                        /* Pattern Item */
                        <div
                            key={index}
                            onClick={() => setSelectedPatternIndex(index)}
                            className="pattern-item"
                        >
                            <img alt={`Pattern preview ${index}`} className="pattern-img" src={src} />
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="modal-footer">
            <button
                onClick={() => setIsModalOpen(false)}
                className="btn-cancel"
            >
                Cancel
            </button>
            <button
                onClick={() => setIsModalOpen(false)}
                className="btn-apply"
            >
                Apply
            </button>
        </div>
    </div>
</div>
