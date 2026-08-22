const app = document.querySelector('#app');
const startPanel = document.querySelector('#startPanel');

if (app && startPanel) {
  const style = document.createElement('style');
  style.textContent = `
    #menuBtn {
      position: absolute;
      z-index: 13;
      left: 50%;
      bottom: max(14px, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      min-width: 112px;
      min-height: 46px;
      padding: 0 18px;
      border-radius: 999px;
      background: rgba(255,255,255,.88);
      color: #243039;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 14px rgba(0,0,0,.18);
      font-size: 13px;
      font-weight: 800;
      touch-action: manipulation;
    }
    #menuBtn[hidden] { display: none; }
    @media (orientation: landscape) and (max-height: 500px) {
      #menuBtn {
        bottom: 8px;
        min-height: 42px;
        min-width: 104px;
      }
    }
  `;
  document.head.appendChild(style);

  const menuBtn = document.createElement('button');
  menuBtn.id = 'menuBtn';
  menuBtn.type = 'button';
  menuBtn.textContent = '☰ メニュー';
  menuBtn.setAttribute('aria-label', 'メニューへ戻る');
  app.appendChild(menuBtn);

  const syncVisibility = () => {
    menuBtn.hidden = !startPanel.classList.contains('hidden');
  };

  new MutationObserver(syncVisibility).observe(startPanel, {
    attributes: true,
    attributeFilter: ['class']
  });

  menuBtn.addEventListener('pointerdown', event => {
    event.stopPropagation();
  });

  menuBtn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (window.confirm('対戦を終了してメニューに戻りますか？')) {
      window.location.reload();
    }
  });

  syncVisibility();
}
