/* Dayman — Push notifications: permission, subscribe, schedule. */

import { getClient, isConfigured } from './supabase.js';
import { currentUser } from './auth.js';

var VAPID_PUBLIC_KEY = 'BOPH5zU7ffkq6uZri22YGcV0gNzznVIfX_lP6xT3GVwpkBwY868GjecGLBhlYRscv3LTHUlV6M2PbTO7k4whBXE';

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(base64);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPermission() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

export async function subscribePush() {
  if (!isPushSupported()) return null;
  var perm = await getPermission();
  if (perm !== 'granted') return null;
  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    return sub;
  } catch (e) { return null; }
}

export async function saveSubscription(sub) {
  var sb = getClient();
  var user = currentUser();
  if (!sb || !user || !sub) return;
  var json = sub.toJSON();
  try {
    await sb.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: json.endpoint,
      keys: json.keys,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  } catch (e) { /* silent */ }
}

export async function removeSubscription() {
  var sb = getClient();
  var user = currentUser();
  if (!sb || !user) return;
  try {
    await sb.from('push_subscriptions').delete().eq('user_id', user.id);
  } catch (e) { /* silent */ }
}

export async function ensureSubscription() {
  var sub = await subscribePush();
  if (sub) await saveSubscription(sub);
  return sub;
}

export async function cancelSubscription() {
  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) { /* silent */ }
  await removeSubscription();
}
