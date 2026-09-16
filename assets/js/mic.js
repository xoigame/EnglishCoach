// One shared recognizer for the whole app — two live recognitions fight each other.

import { Listener, asrSupported } from './speech.js';

let busy = false;
let current = null;

export { asrSupported };

/**
 * Record one utterance.
 * @returns {Promise<string>} the transcript ('' if nothing was heard)
 */
export function captureOnce({ onInterim, onStart, onStop, timeoutMs = 12000 } = {}) {
  if (busy) { current?.stop(); return Promise.resolve(''); }
  if (!asrSupported) return Promise.reject(new Error('no-support'));

  return new Promise((resolve, reject) => {
    let settled = false;
    let heard = '';
    const finish = value => {
      if (settled) return;
      settled = true;
      busy = false;
      current = null;
      clearTimeout(timer);
      onStop?.();
      resolve(value);
    };

    const listener = new Listener({
      onInterim: text => onInterim?.(text),
      onFinal: text => { heard = text; },
      onError: err => {
        if (settled) return;
        if (err === 'no-speech' || err === 'aborted') return finish('');
        settled = true; busy = false; current = null;
        clearTimeout(timer); onStop?.();
        reject(new Error(err));
      },
      onEnd: () => finish(heard),
    });

    const timer = setTimeout(() => listener.stop(), timeoutMs);
    busy = true;
    current = listener;
    onStart?.();
    listener.start();
  });
}

export function isRecording() { return busy; }
export function stopCapture() { current?.stop(); }
