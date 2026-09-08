import { useEffect, useState } from 'react';
import axios from './axios_instance';

let snapshot = null;
let error = '';
let token;
let inFlight = null;
let timer;
const listeners = new Set();
function notify() { listeners.forEach(listener => listener({ snapshot, error })); }
function accept(value) {
  if (!value || !Array.isArray(value.servers)) return;
  if (snapshot?.updatedAt && Date.parse(value.updatedAt) < Date.parse(snapshot.updatedAt)) return;
  snapshot = value;
  error = '';
  notify();
}
async function refresh() {
  if (inFlight) return inFlight;
  const requestToken = token;
  const previous = snapshot;
  inFlight = axios.get('/fleet', { timeout: 10000 }).then(response => {
    if (token === requestToken) accept(response.data);
  }).catch(() => {
    if (token === requestToken && snapshot === previous) {
      error = 'Live updates unavailable. Showing the last successful snapshot.';
      notify();
    }
  }).finally(() => { inFlight = null; });
  return inFlight;
}

export default function useFleet(enabled = true) {
  const [state, setState] = useState({ snapshot, error });
  useEffect(() => {
    if (!enabled) {
      setState({ snapshot: null, error: '' });
      return undefined;
    }
    const currentToken = localStorage.getItem('token');
    if (token !== currentToken) { token = currentToken; snapshot = null; error = ''; }
    listeners.add(setState);
    setState({ snapshot, error });
    if (listeners.size === 1) {
      void refresh();
      timer = setInterval(refresh, 5000);
    }
    return () => {
      listeners.delete(setState);
      if (!listeners.size) clearInterval(timer);
    };
  }, [enabled]);
  return { ...state, refresh };
}
