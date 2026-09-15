// input.js — 输入三件套：拖拽 / 文件选择 / 剪贴板粘贴（F-5）
// 纯事件装配，无业务逻辑；文件经 onFile 回调交给 app.js

/**
 * @param {{zone:HTMLElement, input:HTMLInputElement}} targets
 * @param {(file:File)=>void} onFile 合法图片文件回调
 * @param {(errKey:string)=>void} onError 错误文案 key 回调（i18n）
 */
export function attachInputs({ zone, input, onFile, onError }) {
  const accept = (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      onError?.('errType');
      return;
    }
    onFile(file);
  };

  // 点击 / 键盘（zone 有 tabindex+role=button）→ 文件选择
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    accept(input.files && input.files[0]);
    input.value = ''; // 允许重复选同一文件
  });

  // 拖拽：zone 高亮 + drop 加载
  for (const ev of ['dragenter', 'dragover']) {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  }
  for (const ev of ['dragleave', 'drop']) {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  }
  zone.addEventListener('drop', (e) => accept(e.dataTransfer?.files?.[0]));
  // zone 之外拖入：阻止浏览器直接打开图片文件
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // 剪贴板粘贴（全页面监听，Ctrl/⌘+V）
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        e.preventDefault();
        accept(it.getAsFile());
        return;
      }
    }
  });
}
