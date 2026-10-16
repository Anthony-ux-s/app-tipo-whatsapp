// Aplica el tema guardado antes de pintar (evita el destello claro en modo oscuro).
try {
  var t = localStorage.getItem('parla.theme');
  if (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
