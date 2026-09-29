// Aplica o tema (claro/escuro) antes do React carregar, evitando "flash" claro no modo escuro.
// Fica em arquivo separado (e não inline no index.html) para funcionar com a Content-Security-Policy.
// A chave precisa ser a mesma de THEME_STORAGE_KEY em src/utils/constants.js.
;(function () {
  var pref = null
  try {
    pref = localStorage.getItem('academia.theme')
  } catch (e) {
    // storage indisponível
  }
  var dark = pref === 'dark' || (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
