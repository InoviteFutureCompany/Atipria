const header = document.querySelector('.site-header');
document.querySelector('.menu-toggle')?.addEventListener('click', () => header.classList.toggle('open'));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = Number(el.dataset.count || 0);
    let current = 0;
    const step = Math.max(1, Math.round(target / 40));
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(timer); }
      el.textContent = current;
    }, 28);
    statsObserver.unobserve(el);
  });
});
document.querySelectorAll('[data-count]').forEach(el => statsObserver.observe(el));

document.querySelectorAll('.image-choice').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.image-choice').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    const result = document.getElementById('quiz-result');
    result.textContent = card.dataset.choice === 'ai' ? 'Correct.' : 'Wrong.';
    result.style.color = card.dataset.choice === 'ai' ? '#22e6c5' : '#ff475e';
  });
});

document.getElementById('reveal-answer')?.addEventListener('click', () => {
  const aiCard = document.querySelector('[data-choice="ai"]');
  aiCard?.classList.add('active');
  const result = document.getElementById('quiz-result');
  result.textContent = 'Image A is AI.';
  result.style.color = '#22e6c5';
});

const hero = document.querySelector('.hero');
hero?.addEventListener('mousemove', (e) => {
  const rect = hero.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;
  document.querySelectorAll('[data-depth]').forEach(el => {
    const depth = Number(el.dataset.depth);
    el.style.translate = `${x * depth}px ${y * depth}px`;
  });
});


document.querySelectorAll('.faq-accordion details').forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    const group = item.closest('.faq-accordion');
    group?.querySelectorAll('details').forEach((other) => {
      if (other !== item) other.removeAttribute('open');
    });
  });
});
