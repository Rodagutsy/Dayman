/* Dayman — PWA install prompt.
   Shows on every browser load (never remembered) and never when the app is
   already running from the home screen. */

var deferred = null;
var installed = false;
var shown = false;

function isStandalone() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch (e) {}
  return window.navigator.standalone === true;
}

function isIOS() {
  var ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function slot() { return document.getElementById('install-slot'); }

function hide() {
  var host = slot();
  if (host) host.innerHTML = '';
  shown = false;
}

function build() {
  var host = slot();
  if (!host || shown) return;
  shown = true;
  host.innerHTML =
    '<div class="install-card" role="region" aria-label="Install app">' +
      '<div class="ic-icon" aria-hidden="true">&#x1F4E6;</div>' +
      '<div class="ic-body">' +
        '<div class="ic-title">Install Dayman</div>' +
        '<div class="ic-desc" id="ic-desc">Add it to your home screen so it opens like an app.</div>' +
        '<p class="ios-hint hidden" id="ic-ios">Tap the Share button, then &ldquo;Add to Home Screen&rdquo;.</p>' +
      '</div>' +
      '<div class="ic-actions">' +
        '<button class="btn primary" id="ic-install" type="button">Install</button>' +
        '<button class="ic-x" id="ic-close" type="button" aria-label="Dismiss">&times;</button>' +
      '</div>' +
    '</div>';

  var go = document.getElementById('ic-install');
  var close = document.getElementById('ic-close');
  var iosHint = document.getElementById('ic-ios');
  var desc = document.getElementById('ic-desc');

  // No beforeinstallprompt on iOS — instructions only, no install button.
  if (isIOS() || !deferred) {
    if (iosHint) iosHint.classList.remove('hidden');
    if (desc) desc.textContent = 'Dayman works best installed on your phone.';
    if (go) { go.textContent = 'Got It'; go.classList.remove('primary'); }
  }

  if (close) close.addEventListener('click', hide);
  if (go) go.addEventListener('click', function () {
    if (deferred) {
      var p = deferred;
      deferred = null;
      p.prompt();
      if (p.userChoice && p.userChoice.then) {
        p.userChoice.then(function (choice) {
          if (choice && choice.outcome === 'accepted') { installed = true; hide(); }
        }).catch(function () {});
      }
    } else {
      hide();
    }
  });
}

function maybeShow() {
  if (installed || isStandalone()) return;
  if (!slot()) return;
  build();
}

/* Wire up. Safe to call once at boot. */
export function initInstall() {
  installed = isStandalone();
  if (installed) return;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    maybeShow();
  });

  window.addEventListener('appinstalled', function () {
    installed = true;
    deferred = null;
    hide();
  });

  // If the browser never fires beforeinstallprompt (iOS, Firefox, already
  // installed, or non-installable context) still offer it once per load.
  setTimeout(maybeShow, 1200);
}

export function isInstalled() { return installed || isStandalone(); }
