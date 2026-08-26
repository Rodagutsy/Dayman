/* Dayspeak — platform APIs: wake lock + notifications. */

var wakeLock = null;

export function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  navigator.wakeLock.request('screen').then(function (s) {
    wakeLock = s;
    s.addEventListener('release', function () { wakeLock = null; });
  }).catch(function () {});
}

export function releaseWakeLock() {
  if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
}

export function askNotify() {
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  } catch (e) {}
}

export function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: body, icon: 'icons/icon-192.png', tag: 'dayspeak' });
    }
  } catch (e) {}
}
