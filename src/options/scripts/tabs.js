function initTabs() {
    try {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanels = document.querySelectorAll('.tab-panel');

        if (!tabButtons.length || !tabPanels.length) {
            return;
        }

        function activateTab(targetId) {
            const hasTarget = Array.from(tabPanels).some(panel => panel.id === targetId);
            const safeTargetId = hasTarget ? targetId : tabButtons[0].getAttribute('data-tab');

            tabButtons.forEach(btn => {
                const isActive = btn.getAttribute('data-tab') === safeTargetId;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
                btn.setAttribute('tabindex', isActive ? '0' : '-1');
            });

            tabPanels.forEach(panel => {
                const isActive = panel.id === safeTargetId;
                panel.hidden = !isActive;
                panel.classList.toggle('active', isActive);
            });
        }

        function focusTabByOffset(currentIndex, offset) {
            const nextIndex = (currentIndex + offset + tabButtons.length) % tabButtons.length;
            tabButtons[nextIndex].focus();
            activateTab(tabButtons[nextIndex].getAttribute('data-tab'));
        }

        tabButtons.forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetId = btn.getAttribute('data-tab');
                activateTab(targetId);
            });

            btn.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    focusTabByOffset(index, 1);
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    focusTabByOffset(index, -1);
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    tabButtons[0].focus();
                    activateTab(tabButtons[0].getAttribute('data-tab'));
                } else if (e.key === 'End') {
                    e.preventDefault();
                    const last = tabButtons[tabButtons.length - 1];
                    last.focus();
                    activateTab(last.getAttribute('data-tab'));
                }
            });
        });

        // Check URL hash for specific tab
        const urlHash = window.location.hash;
        if (urlHash && urlHash.startsWith('#tab=')) {
            const tabName = urlHash.substring(5); // Remove '#tab='
            const targetTab = Array.from(tabButtons).find(btn => btn.getAttribute('data-tab') === `tab-${tabName}`);
            if (targetTab) {
                activateTab(targetTab.getAttribute('data-tab'));
                return;
            }
        }

        const firstTab = tabButtons[0];
        if (firstTab) {
            activateTab(firstTab.getAttribute('data-tab'));
        }
    } catch (err) {
        console.error('Tabs: Initialization error', err);
    }
}

// Initialize tabs after content is loaded
function tryInitTabs() {
    const tabPanels = document.querySelectorAll('.tab-panel');
    const tabButtons = document.querySelectorAll('.tab-button');
    if (tabPanels.length > 0 && tabButtons.length > 0) {
        initTabs();
        return true;
    }
    return false;
}

// Set up initialization
function setupTabInit() {
    // Try immediately first
    if (tryInitTabs()) return;

    // If DOM still loading, wait for it
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            if (!tryInitTabs()) {
                window.addEventListener('tabContentLoaded', initTabs);
            }
        });
    } else {
        // DOM loaded but tabs not ready, wait for event
        window.addEventListener('tabContentLoaded', initTabs);
    }
}

// Initialize
setupTabInit();
