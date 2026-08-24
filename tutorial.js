export class TutorialController {
  constructor(elements, callbacks = {}) {
    this.elements = elements;
    this.callbacks = callbacks;
    this.active = false;
    this.step = 'inactive';
    elements.next.addEventListener('click', event => {
      event.stopPropagation();
      if (this.step === 'pose') {
        this.step = 'aim';
        this.render();
      }
    });
    elements.skip.addEventListener('click', event => {
      event.stopPropagation();
      this.finish(true);
    });
  }

  start() {
    this.active = true;
    this.step = 'pose';
    this.elements.panel.classList.add('show');
    this.render();
  }

  onAimCalibrated() {
    if (this.active && this.step === 'aim') {
      this.step = 'baseline';
      this.render();
    }
  }

  onHandRegistered() {
    if (this.active && this.step === 'baseline') {
      this.step = 'pinch';
      this.render();
    }
  }

  onHandState(state) {
    if (!this.active) return;
    if (this.step === 'pinch' && (state === 'pinched' || state === 'draw-low' || state === 'ready')) this.step = 'draw';
    if (this.step === 'draw' && state === 'ready') this.step = 'release';
    this.render();
  }

  onPracticeFired() {
    if (!this.active) return;
    this.step = 'shot';
    this.render();
  }

  onPracticeComplete() {
    if (this.active && this.step === 'shot') this.finish(false);
  }

  finish(skipped) {
    if (!this.active) return;
    this.active = false;
    this.step = 'inactive';
    this.elements.panel.classList.remove('show');
    this.callbacks.onFinish?.(skipped);
  }

  render() {
    const content = {
      pose: ['1 / 6　スマホを構える', '片手でスマホを縦に持ち、もう片方の手がフロントカメラに映る位置を確認します。', '次へ'],
      aim: ['2 / 6　照準リセット', '中央の的へスマホを向け、持つ手側の「照準リセット」を押してください。', '照準リセットを押す'],
      baseline: ['3 / 6　手の基準を登録', '弓を引かず、自然な位置で手を安定させてから「手の基準を登録」を押してください。', '基準登録ボタンを押す'],
      pinch: ['4 / 6　弦をつかむ', '親指と人差し指を🤏の形にして弦をつかみます。', '🤏を認識待ち'],
      draw: ['5 / 6　奥へ引く', 'つまんだまま手をカメラから奥へ動かし、引きゲージを55%以上にします。', 'もっと奥へ引く'],
      release: ['6 / 6　指を離す', '「発射可能」が出たら親指と人差し指を離してください。試射はスコアに入りません。', '指を離して試射'],
      shot: ['試射中', '矢の行方を確認しています。この1本は本番スコアに入りません。', '命中後に本番へ']
    }[this.step];
    if (!content) return;
    this.elements.title.textContent = content[0];
    this.elements.text.textContent = content[1];
    this.elements.next.textContent = content[2];
    this.elements.next.hidden = this.step !== 'pose';
    this.elements.hint.textContent = content[2];
  }
}
