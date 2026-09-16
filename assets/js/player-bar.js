// Thanh phát âm thanh dính đáy trang: hiện câu đang đọc, cho dừng bất cứ lúc nào.

import { onPlaybackChange, stopAllAudio } from './speech.js';

export function initPlayerBar() {
  const bar = document.getElementById('audioBar');
  if (!bar) return;
  const textEl = document.getElementById('audioBarText');
  const stopBtn = document.getElementById('audioBarStop');

  // stopAllAudio, không phải stopSpeaking: player.js/roleplay.js đọc nối tiếp
  // nhiều câu, chỉ ngắt câu hiện tại thì câu kế tiếp sẽ tự phát luôn sau đó.
  stopBtn.addEventListener('click', stopAllAudio);

  onPlaybackChange(text => {
    if (text) {
      textEl.textContent = text;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  });
}
