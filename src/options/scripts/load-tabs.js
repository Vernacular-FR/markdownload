// Dynamically load tab content from partial HTML files
(async function loadTabContent() {
  const tabContentContainer = document.getElementById('tab-content-container');
  if (!tabContentContainer) return;

  const tabs = [
    { id: 'tab-download', file: 'tabs/download.html' },
    { id: 'tab-edit', file: 'tabs/template.html' },
    { id: 'tab-images', file: 'tabs/images.html' },
    { id: 'tab-conversion', file: 'tabs/conversion.html' },
    { id: 'tab-import', file: 'tabs/import.html' }
  ];

  try {
    const tabPanels = await Promise.all(tabs.map(async ({ id, file }) => {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`Failed to load ${file}`);
      const html = await response.text();
      return { id, html };
    }));

    tabPanels.forEach(({ id, html }) => {
      const panel = document.createElement('div');
      panel.className = 'tab-panel';
      panel.id = id;
      panel.role = 'tabpanel';
      panel.setAttribute('aria-labelledby', `tab-btn-${id.replace('tab-', '')}`);
      panel.setAttribute('tabindex', '0');
      if (id !== 'tab-download') panel.hidden = true;
      panel.innerHTML = html;
      tabContentContainer.appendChild(panel);
    });

    // Dispatch event to signal that tab content is loaded
    window.dispatchEvent(new CustomEvent('tabContentLoaded'));

    // Initialize tabs if the function exists
    if (typeof initTabs === 'function') {
      initTabs();
    }
  } catch (error) {
    console.error('Error loading tab content:', error);
  }
})();
