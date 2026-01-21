/**
 * Device Adaptation Logic
 * Handles switching between Horizontal (PC/Landscape) and Vertical (Mobile/Portrait) modes.
 */

const DeviceAdapter = {
    init() {
        this.appRoot = document.getElementById('app-root');
        this.body = document.body;

        // this.bindEvents(); // Manual switching buttons removed
        this.restoreState();

        // Listen for resize to auto-adapt if no manual override is active?
        // User requested "Auto switch when vertical proportion detected".
        // We will prioritize auto-detection unless user explicitly clicked a button recently? 
        // Or just let resize always win? Let's let resize win for true responsiveness.
        window.addEventListener('resize', () => {
            // Debounce slightly
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.autoDetect(), 100);
        });
    },

    bindEvents() {
        // Manual switching buttons removed
    },

    setMode(mode) {
        if (mode === 'vertical') {
            this.body.classList.add('vertical-mode');
            this.body.classList.remove('horizontal-mode');



            // Trigger map resize
            if (window.map) setTimeout(() => window.map.resize(), 300);
        } else {
            this.body.classList.remove('vertical-mode');
            this.body.classList.add('horizontal-mode');



            // Trigger map resize
            if (window.map) setTimeout(() => window.map.resize(), 300);
        }

        // Re-init bottom sheet listener if needed
        this.initBottomSheet();
    },

    autoDetect() {
        // If user manually set a mode recently, maybe we respect it? 
        // But "Auto switch when vertical" implies responsiveness. 
        // Let's implement: If aspect ratio is Vertical, go Vertical.

        const isPortrait = window.innerHeight > window.innerWidth;
        this.setMode(isPortrait ? 'vertical' : 'horizontal');
    },

    restoreState() {
        // On load, check LocalStorage logic OR just auto-detect.
        // If we want "Auto switch", we should probably prioritize current screen state 
        // but maybe respect manual choice if it conflicts?
        // User said: "Automatically switch to vertical mode when vertical screen detected".
        // This suggests Auto > Saved Preference usually.
        // Let's run autoDetect on load.

        this.autoDetect();

        // However, if we are in a PC browser and the user clicked "Vertical Mode" previously to test,
        // we might want to respect that *if* the browser size hasn't changed?
        // To be safe and compliant with "Auto switch", I will default to Auto.
    },

    initBottomSheet() {
        const panel = document.getElementById('control-panel');
        const header = panel.querySelector('.panel-header');

        if (header) {
            // Remove old listener to avoid duplicates if init called multiple times?
            // Element replacement or cloneNode is nuclear. 
            // Better to just set a flag or be idempotent.
            if (!this.headerListenerAdded) {
                header.addEventListener('click', () => {
                    // Only toggle if in vertical mode
                    const isVertical = this.body.classList.contains('vertical-mode');
                    if (isVertical) {
                        panel.classList.toggle('expanded');
                    }
                });
                this.headerListenerAdded = true;
            }
        }
    }
};

// Initialize after DOM load
document.addEventListener('DOMContentLoaded', () => {
    DeviceAdapter.init();
});
