import { useCallback, useEffect, useState } from "react";
import { fetchPushPublicKey, postNativePushToken, postPushSubscribe, postPushUnsubscribe } from "../lib/api.js";
import { isNativeApp, nativeCall } from "../lib/native.js";
import {
  currentSubscription,
  permissionState,
  pushSupported,
  serializeSubscription,
  subscribeToPush,
} from "../lib/push.js";

const IDLE = { status: "idle", error: "" };

/**
 * Owns one member device's push subscription.
 *
 * `enabled` means "this browser has a subscription AND the backend knows about
 * it". The browser's own subscription can outlive a member session (a shared
 * phone, a re-install), so every time a member signs in the live subscription
 * is re-sent to the backend — that upsert re-points the endpoint at whoever is
 * signed in now, and is also what repairs a row lost to a rotated key.
 */
export default function usePushNotifications(slug, memberId) {
  // Inside the Gym Boo app notifications are native (FCM) and the wrapper does
  // the permission/token work; everything below branches on this.
  const [native] = useState(() => isNativeApp());
  const [supported] = useState(() => native || pushSupported());
  const [permission, setPermission] = useState(() => (native ? "default" : permissionState()));
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState(IDLE);

  /**
   * Keeps `permission` in step with the browser.
   *
   * A member who tapped "Block" can only undo it in site settings — which they
   * do in another tab or a settings panel, with this page still open and its
   * state frozen at "denied". Without this the switch would stay greyed out
   * until a full reload, which reads as "I unblocked it and it still doesn't
   * work". Two signals, because neither covers every browser: the Permissions
   * API fires the moment it changes, and coming back to the tab catches the
   * browsers (notably older Safari) where that query isn't available.
   */
  useEffect(() => {
    if (!supported || native) return undefined;
    const sync = () => setPermission(permissionState());

    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);

    let status = null;
    navigator.permissions
      ?.query({ name: "notifications" })
      .then((result) => {
        status = result;
        result.addEventListener("change", sync);
      })
      .catch(() => {
        // Permissions API unavailable for notifications — the tab-focus
        // listeners above are the fallback.
      });

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      status?.removeEventListener("change", sync);
    };
  }, [supported, native]);

  // Does this deployment have VAPID keys at all? Without them the UI should not
  // offer a switch that can only fail.
  useEffect(() => {
    let active = true;
    fetchPushPublicKey()
      .then((data) =>
        active && setAvailable(native ? Boolean(data.nativeAvailable) : Boolean(data.available && data.publicKey)),
      )
      .catch(() => active && setAvailable(false));
    return () => {
      active = false;
    };
  }, [native]);

  useEffect(() => {
    if (!supported || !slug || !memberId) {
      setEnabled(false);
      return undefined;
    }
    let active = true;
    if (native) {
      // Re-register the device token silently on every sign-in (no OS prompt:
      // "status" never asks), same reasoning as the browser path below.
      nativeCall("status")
        .then(async (info) => {
          if (!active) return;
          // First sign-in inside the app: ask for permission straight away, as a
          // native app would. Only while still undecided, so a member who said
          // "no" is never nagged (they can still use the card to turn it on).
          if (info.permission === "default") info = await nativeCall("enable");
          if (!active) return;
          setPermission(info.permission);
          if (info.permission !== "granted" || !info.token) return setEnabled(false);
          await postNativePushToken(slug, info.token);
          if (active) setEnabled(true);
        })
        .catch(() => active && setEnabled(false));
      return () => {
        active = false;
      };
    }
    currentSubscription()
      .then(async (subscription) => {
        if (!active || !subscription) {
          if (active) setEnabled(false);
          return;
        }
        // Re-register silently: no prompt is shown, and it costs one request.
        try {
          await postPushSubscribe(slug, serializeSubscription(subscription));
          if (active) setEnabled(true);
        } catch {
          if (active) setEnabled(false);
        }
      })
      .catch(() => active && setEnabled(false));
    return () => {
      active = false;
    };
  }, [supported, native, slug, memberId]);

  // Must be called straight from a click — browsers only show the permission
  // prompt during a user gesture.
  const enable = useCallback(async () => {
    if (!supported || !slug) return;
    setState({ status: "busy", error: "" });
    try {
      if (native) {
        const info = await nativeCall("enable");
        setPermission(info.permission);
        if (!info.token) {
          throw new Error(
            info.permission === "denied"
              ? "Notifications are blocked. Turn them on for Gym Boo in your phone settings."
              : "Could not get a notification token. Check your connection and try again.",
          );
        }
        await postNativePushToken(slug, info.token);
        setEnabled(true);
        setState({ status: "done", error: "" });
        return;
      }
      const { publicKey, available: ready } = await fetchPushPublicKey();
      if (!ready || !publicKey) throw new Error("Notifications are not set up for this gym yet");
      const subscription = await subscribeToPush(publicKey);
      await postPushSubscribe(slug, serializeSubscription(subscription));
      setEnabled(true);
      setPermission(permissionState());
      setState({ status: "done", error: "" });
    } catch (error) {
      setPermission(permissionState());
      setState({ status: "error", error: error.message || "Could not turn on notifications" });
    }
  }, [supported, native, slug]);

  /**
   * Drops the browser subscription first, then the stored row. If the network
   * call fails the device is already unsubscribed, so the backend would only be
   * holding a dead endpoint — which its own 410 handling removes on the next send.
   */
  const disable = useCallback(async () => {
    if (!supported || !slug) return;
    setState({ status: "busy", error: "" });
    try {
      if (native) {
        // The device token itself is kept; only the backend row is dropped, so
        // turning notifications back on is instant and needs no new prompt.
        const info = await nativeCall("status");
        if (info.token) await postPushUnsubscribe(slug, `fcm://${info.token}`);
        setEnabled(false);
        setState({ status: "done", error: "" });
        return;
      }
      const subscription = await currentSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await postPushUnsubscribe(slug, endpoint);
      }
      setEnabled(false);
      setState({ status: "done", error: "" });
    } catch (error) {
      setState({ status: "error", error: error.message || "Could not turn off notifications" });
    }
  }, [supported, native, slug]);

  return {
    available: available && supported,
    busy: state.status === "busy",
    disable,
    enable,
    enabled,
    error: state.error,
    // "denied" can only be cleared from browser settings, so the UI has to say so.
    permission,
    supported,
  };
}
