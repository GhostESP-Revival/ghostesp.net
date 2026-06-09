(function () {
  var GA_ID = 'G-MS2T2178R5';
  var STORAGE_KEY = 'cookie-consent';

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  function isDNT() {
    return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  }

  function clearGACookies() {
    var gaDomains = [location.hostname, '.' + location.hostname];
    var gaCookies = ['_ga', '_ga_' + GA_ID.replace('G-', '')];
    gaCookies.forEach(function (name) {
      gaDomains.forEach(function (domain) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + domain;
      });
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });
  }

  // Consent Mode v2: set defaults before anything else
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'wait_for_update': 500
  });

  function grantConsent() {
    gtag('consent', 'update', {
      'ad_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied',
      'analytics_storage': 'granted'
    });
  }

  function loadGA() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    s.onload = function () {
      gtag('js', new Date());
      gtag('config', GA_ID, { anonymize_ip: true });
    };
    document.head.appendChild(s);
  }

  function removeBanner() {
    var banner = document.getElementById('cookie-consent-banner');
    if (banner) banner.remove();
  }

  function createBanner() {
    if (document.getElementById('cookie-consent-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.className = 'cookie-consent-banner';
    banner.innerHTML =
      '<div class="cookie-consent-inner">' +
        '<div class="cookie-consent-text">' +
          '<p>We use Google Analytics to understand how visitors use this site. ' +
          'This helps us improve the experience. No personal data is sold or shared. ' +
          '<a href="privacy.html">Privacy Policy</a></p>' +
        '</div>' +
        '<div class="cookie-consent-actions">' +
          '<button id="cookie-consent-reject" class="cookie-consent-btn cookie-consent-btn-reject">Reject</button>' +
          '<button id="cookie-consent-accept" class="cookie-consent-btn cookie-consent-btn-accept">Accept</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(banner);

    document.getElementById('cookie-consent-accept').addEventListener('click', function () {
      setConsent('accepted');
      removeBanner();
      grantConsent();
      loadGA();
    });

    document.getElementById('cookie-consent-reject').addEventListener('click', function () {
      setConsent('rejected');
      removeBanner();
      clearGACookies();
    });
  }

  function showSettings() {
    var existing = document.getElementById('cookie-consent-banner');
    if (existing) return;
    createBanner();
  }

  window.CookieConsent = { showSettings: showSettings };

  // If DNT/GPC is set, auto-reject and don't show banner
  if (isDNT()) {
    if (getConsent() === 'accepted') {
      setConsent('rejected');
      clearGACookies();
    }
    return;
  }

  var consent = getConsent();
  if (consent === 'accepted') {
    grantConsent();
    loadGA();
  } else if (consent === 'rejected') {
    clearGACookies();
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createBanner);
    } else {
      createBanner();
    }
  }
})();
