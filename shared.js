// Language switcher
function setLang(lang) {
  document.getElementById('mainBody').className = 'lang-' + lang;
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick').includes("'" + lang + "'"));
  });
  localStorage.setItem('vomoLang', lang);
}

// Mobile menu
function toggleMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

// Load saved language
window.addEventListener('DOMContentLoaded', function() {
  var lang = localStorage.getItem('vomoLang') || 'en';
  document.getElementById('mainBody').className = 'lang-' + lang;
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick').includes("'" + lang + "'"));
  });

  // Close mobile menu on link click
  document.querySelectorAll('#mobileMenu a').forEach(a => {
    a.addEventListener('click', () => document.getElementById('mobileMenu').classList.remove('open'));
  });
});
