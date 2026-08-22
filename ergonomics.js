const app = document.querySelector('#app');
const options = [...document.querySelectorAll('input[name="phoneHand"]')];

function applyPhoneHand(value) {
  const side = value === 'left' ? 'left' : 'right';
  app?.classList.toggle('hold-left', side === 'left');
  app?.classList.toggle('hold-right', side === 'right');
  try { localStorage.setItem('gyroArchery.phoneHand', side); } catch {}
}

let saved = 'right';
try { saved = localStorage.getItem('gyroArchery.phoneHand') || 'right'; } catch {}
const initial = options.find(option => option.value === saved) || options[0];
if (initial) initial.checked = true;
applyPhoneHand(initial?.value || 'right');

for (const option of options) {
  option.addEventListener('change', () => {
    if (option.checked) applyPhoneHand(option.value);
  });
}
