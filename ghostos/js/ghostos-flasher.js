function renderGhostOSFlasherApp(rootEl) {
  if (!rootEl) return;
  rootEl.innerHTML = '<div class="ghostos-flasher-frame-wrap"><iframe src="ESPressoFlash/index.html" class="ghostos-flasher-frame" loading="lazy" title="ESPressoFlash flasher"></iframe></div>';
}

window.renderGhostOSFlasherApp = renderGhostOSFlasherApp;
