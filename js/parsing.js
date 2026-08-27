/* Dayman — task and reply parsing. Pure functions, zero imports. */

export function parseTasks(raw) {
  if (!raw) return [];
  var parts = String(raw)
    .replace(/\r/g, '')
    .split(/\n|,|;|·|•|\bthen\b/gi);
  var out = [];
  parts.forEach(function (p) {
    var s = p.replace(/^[\s\-–—*\d.)]+/, '').trim();
    s = s.replace(/[.\s]+$/, '');
    if (s.length < 2) return;
    out.push(s);
  });
  return out;
}

export function durationHint(text) {
  var m = /(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h)\b/i.exec(text);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = /(\d+)\s*(minutes|minute|mins|min|m)\b/i.exec(text);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function cleanName(text) {
  return text
    .replace(/[-–—(]?\s*\d+(?:\.\d+)?\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m)\b\)?/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '')
    .trim() || text.trim();
}

var WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fourty: 40, forty: 40, fifty: 50, sixty: 60 };

export function parseReply(text) {
  var s = (text || '').toLowerCase();
  if (!s) return null;
  if (/\b(done|finished|complete|completed|yes done|all done|move on|next)\b/.test(s) && !/\bnot done\b/.test(s)) return { kind: 'done' };
  var m = /(\d+)\s*(?:more\s*)?(?:min|mins|minute|minutes)?/.exec(s);
  var n = m ? parseInt(m[1], 10) : null;
  if (n === null) {
    for (var w in WORDNUM) { if (s.indexOf(w) >= 0) { n = WORDNUM[w]; break; } }
  }
  if (n !== null && n > 0 && n <= 180 && /(more|min|minute|extend|another|need|longer)/.test(s)) return { kind: 'extend', min: n };
  if (n !== null && n > 0 && n <= 180 && /^\s*\d+\s*$/.test(s)) return { kind: 'extend', min: n };
  if (/\b(no|not yet|need more|more time|keep going|still going|almost)\b/.test(s)) return { kind: 'extend', min: 5 };
  if (/\byes\b/.test(s)) return { kind: 'done' };
  return null;
}
