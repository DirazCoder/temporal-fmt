// The only script on the page: the copy button on the install command.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
  } catch {
    return;
  }
  btn.dataset.done = '';
  btn.textContent = 'copied';
  setTimeout(() => {
    delete btn.dataset.done;
    btn.textContent = 'copy';
  }, 1400);
});
