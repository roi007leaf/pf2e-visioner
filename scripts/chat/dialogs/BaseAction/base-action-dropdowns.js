export function attachDropdownHandlers(app) {
  if (!app.element) return;

  if (app.element.dataset.dropdownDelegated !== 'true') {
    app.element.dataset.dropdownDelegated = 'true';
    app.element.addEventListener('click', (event) => {
      const toggle = event.target?.closest?.('.dropdown-toggle');
      if (!toggle || !app.element?.contains?.(toggle)) return;
      onDropdownToggle(app, event, toggle);
    });
  }

  if (!app._dropdownDocumentClickHandler && typeof document !== 'undefined') {
    app._dropdownDocumentClickHandler = () => {
      app._dropdownDocumentClickHandler = null;
      closeAllDropdowns(app);
    };
    document.addEventListener('click', app._dropdownDocumentClickHandler, { once: true });
  }
}

export function onDropdownToggle(app, event, toggle) {
  event.preventDefault();
  event.stopPropagation();

  const dropdown = toggle.closest('.row-action-dropdown');
  if (!dropdown) return;

  const menu = dropdown.querySelector('.dropdown-menu');
  if (!menu) return;

  const wasOpen = menu.style.display !== 'none';
  closeAllDropdowns(app);
  if (!wasOpen) menu.style.display = 'block';
}

export function detachDropdownDocumentHandler(app) {
  if (!app._dropdownDocumentClickHandler || typeof document === 'undefined') return;

  document.removeEventListener('click', app._dropdownDocumentClickHandler);
  app._dropdownDocumentClickHandler = null;
}

export function closeAllDropdowns(app) {
  if (!app.element) return;

  app.element.querySelectorAll('.dropdown-menu').forEach((menu) => {
    menu.style.display = 'none';
  });
}
