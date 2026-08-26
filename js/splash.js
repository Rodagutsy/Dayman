/* Dayman — animated splash screen */
import { splashNote, splashFinal } from './audio.js';

const NAME = 'Dayman';
const LETTER_DELAY = 70;   // ms between each letter
const ANIM_DUR = 400;      // ms per letter animation
const HOLD_AFTER = 400;    // ms to hold after last letter before fade

export function runSplash(onDone) {
  var el = document.getElementById('splash');
  var textEl = document.getElementById('splash-text');
  if (!el || !textEl) { if (onDone) onDone(); return; }

  textEl.innerHTML = '';
  var animCSS = 'letterBounce ' + ANIM_DUR + 'ms cubic-bezier(.68,-.55,.265,1.55) forwards';

  NAME.split('').forEach(function (ch, i) {
    var span = document.createElement('span');
    span.className = 'splash-letter';
    span.textContent = ch === ' ' ? '\u00a0' : ch;
    span.style.animation = animCSS;
    span.style.animationDelay = (200 + i * LETTER_DELAY) + 'ms';
    textEl.appendChild(span);

    // sound per letter
    setTimeout(function () {
      try { splashNote(i); } catch (e) {}
    }, 200 + i * LETTER_DELAY);
  });

  // final chord after all letters land
  var lettersDone = 200 + NAME.length * LETTER_DELAY + ANIM_DUR;
  setTimeout(function () {
    try { splashFinal(); } catch (e) {}
  }, lettersDone);

  // fade out
  var fadeAt = lettersDone + HOLD_AFTER;
  setTimeout(function () {
    el.classList.add('hiding');
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      el.style.display = 'none';
      if (onDone) onDone();
    }
    el.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 700); // fallback
  }, fadeAt);
}
