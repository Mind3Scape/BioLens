/* Сканер бланка. Задняя камера, рамка-подсказка, оценка резкости.
   Кадр отдаётся наружу как File — дальше он идёт тем же путём, что и картинка из галереи. */

import { icon } from './icons.js';
import { toast } from './ui.js';

const kadr = (n) => {
  const x = n % 100, y = x % 10;
  if (x > 10 && x < 20) return 'кадров';
  if (y === 1) return 'кадр';
  if (y > 1 && y < 5) return 'кадра';
  return 'кадров';
};

export async function scan() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
      audio: false,
    });
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Нужен доступ к камере' : 'Камера недоступна на этом устройстве');
    return null;
  }

  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'scan-wrap';
    wrap.innerHTML = `
      <div style="position:relative;flex:1;overflow:hidden">
        <video playsinline muted autoplay style="width:100%;height:100%;object-fit:cover"></video>
        <div class="scan-frame"></div>
        <div id="focusTag" style="position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff;font-size:12.5px;font-weight:600;opacity:.9"></div>
      </div>
      <div class="scan-hint">Положи бланк на ровную поверхность, свет — сверху. Держи края внутри рамки.</div>
      <div class="scan-bar">
        <button class="mini" id="scanCancel" style="background:rgba(255,255,255,.14);color:#fff">Отмена</button>
        <button class="shutter" id="scanShot" aria-label="снять"></button>
        <div id="scanCount" style="color:#fff;font-size:13px;font-weight:700;min-width:64px;text-align:right">0 кадров</div>
      </div>`;
    document.body.appendChild(wrap);

    const video = wrap.querySelector('video');
    video.srcObject = stream;

    const shots = [];
    let raf = 0;

    // грубая оценка резкости: разброс яркости соседних пикселей в центре кадра
    const probe = document.createElement('canvas');
    probe.width = 160; probe.height = 120;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    const tag = wrap.querySelector('#focusTag');

    function tick() {
      if (video.readyState >= 2) {
        pctx.drawImage(video, 0, 0, probe.width, probe.height);
        const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
        let acc = 0, n = 0;
        for (let y = 1; y < probe.height - 1; y += 2) {
          for (let x = 1; x < probe.width - 1; x += 2) {
            const i = (y * probe.width + x) * 4;
            const j = (y * probe.width + x + 1) * 4;
            acc += Math.abs(d[i] - d[j]); n++;
          }
        }
        const sharp = n ? acc / n : 0;
        tag.textContent = sharp > 9 ? 'в фокусе' : 'подвинь ближе или дай больше света';
        tag.style.color = sharp > 9 ? '#3DD183' : 'rgba(255,255,255,.8)';
      }
      raf = requestAnimationFrame(tick);
    }
    tick();

    function close(result) {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach(t => t.stop());
      wrap.remove();
      resolve(result);
    }

    wrap.querySelector('#scanCancel').onclick = () => close(shots.length ? shots : null);

    wrap.querySelector('#scanShot').onclick = async () => {
      const cv = document.createElement('canvas');
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      cv.getContext('2d').drawImage(video, 0, 0);
      if (!cv.width || !cv.height) { toast('Камера ещё не готова — секунду'); return; }
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) { toast('Кадр не получился, сними ещё раз'); return; }
      const file = new File([blob], `скан-${shots.length + 1}.jpg`, { type: 'image/jpeg' });
      shots.push(file);
      wrap.querySelector('#scanCount').textContent = `${shots.length} ${kadr(shots.length)}`;
      // отклик: короткая вспышка рамки
      const fr = wrap.querySelector('.scan-frame');
      fr.style.borderColor = '#3DD183';
      setTimeout(() => (fr.style.borderColor = 'rgba(255,255,255,.85)'), 160);
      if (navigator.vibrate) navigator.vibrate(12);

      // многостраничный бланк — обычная история, поэтому «Готово» появляется после первого кадра
      let done = wrap.querySelector('#scanDone');
      if (!done) {
        done = document.createElement('button');
        done.id = 'scanDone';
        done.className = 'mini';
        done.style.cssText = 'background:#fff;color:#15161B;position:absolute;right:20px;bottom:calc(120px + env(safe-area-inset-bottom,0px))';
        done.innerHTML = 'Готово';
        done.onclick = () => close(shots);
        wrap.appendChild(done);
      }
    };
  });
}


/* ── сканер еды ──────────────────────────────────────────────────
   Отдельный от бланка: у тарелки другая задача и другой ритм. Бланк кладут
   на стол и ловят резкость, тарелку снимают сверху за секунду — поэтому тут
   нет ни оценки фокуса, ни многостраничности, зато есть уголки кадра и
   бегущая линия: они говорят «я смотрю» без единого слова.

   Живой поток нужен ровно затем, чтобы человек НЕ уходил в системную камеру
   и обратно: между «захотел записать обед» и «записал» должно остаться одно
   движение, иначе еду перестают отмечать через неделю. */
export async function scanMeal() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } },
      audio: false,
    });
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Нужен доступ к камере' : 'Камера недоступна на этом устройстве');
    return null;
  }

  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'scan-wrap meal';
    wrap.innerHTML = `
      <div class="mscan-top">
        <button class="rnd" id="mClose" aria-label="закрыть">${icon('cross', 'ico s')}</button>
        <div class="mscan-ttl">Сканер еды</div>
        <button class="rnd" id="mTorch" aria-label="вспышка" hidden>${icon('lightning', 'ico s')}</button>
      </div>
      <div class="mscan-view">
        <video playsinline muted autoplay></video>
        <div class="mscan-frame"><i></i><i></i><i></i><i></i><span class="mscan-line"></span></div>
      </div>
      <div class="mscan-hint">Наведи на тарелку сверху. Чем меньше лишнего в кадре, тем точнее оценка.</div>
      <div class="mscan-bar">
        <button class="mscan-side" id="mPick">${icon('file', 'ico s')}<span>Галерея</span></button>
        <button class="shutter" id="mShot" aria-label="снять"></button>
        <div class="mscan-side ghost"></div>
      </div>`;
    document.body.appendChild(wrap);

    const video = wrap.querySelector('video');
    video.srcObject = stream;

    function close(result) {
      stream.getTracks().forEach(t => t.stop());
      wrap.remove();
      resolve(result);
    }

    /* Фонарик есть далеко не на всех камерах — кнопку показываем только
       когда устройство само сказало, что умеет. */
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    let torch = false;
    if (caps.torch) {
      const tb = wrap.querySelector('#mTorch');
      tb.hidden = false;
      tb.onclick = async () => {
        torch = !torch;
        try { await track.applyConstraints({ advanced: [{ torch }] }); tb.classList.toggle('on', torch); }
        catch { toast('Вспышка не включилась'); }
      };
    }

    wrap.querySelector('#mClose').onclick = () => close(null);

    wrap.querySelector('#mPick').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => close(inp.files?.[0] || null);
      inp.click();
    };

    wrap.querySelector('#mShot').onclick = async () => {
      if (!video.videoWidth) { toast('Камера ещё не готова — секунду'); return; }
      /* Режем по центру в квадрат: тарелка круглая, а широкий кадр тащит в
         оценку половину стола и занижает вес порции. */
      const side = Math.min(video.videoWidth, video.videoHeight);
      const cv = document.createElement('canvas');
      cv.width = side; cv.height = side;
      cv.getContext('2d').drawImage(video,
        (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, side, side);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
      if (!blob) { toast('Кадр не получился, сними ещё раз'); return; }
      wrap.querySelector('.mscan-frame').classList.add('shot');
      if (navigator.vibrate) navigator.vibrate(12);
      setTimeout(() => close(new File([blob], 'тарелка.jpg', { type: 'image/jpeg' })), 130);
    };
  });
}
