(() => {
  const refinementStyles = document.createElement('link');
  refinementStyles.rel = 'stylesheet';
  refinementStyles.href = 'assets/hero-refinement.css';
  document.head.appendChild(refinementStyles);

  const mobileStyles = document.createElement('link');
  mobileStyles.rel = 'stylesheet';
  mobileStyles.href = 'assets/mobile-audit.css';
  document.head.appendChild(mobileStyles);

  const previews = document.querySelectorAll('.browser iframe, .mini-browser iframe');
  previews.forEach((preview) => {
    preview.setAttribute('scrolling', 'no');
    preview.setAttribute('tabindex', '-1');
    preview.setAttribute('aria-hidden', 'true');
    preview.style.pointerEvents = 'none';
    preview.style.overflow = 'hidden';
  });

  const form = document.getElementById('project-form');
  if (!form) return;
  const status = form.querySelector('.form-status');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = new FormData(form);
    const subject = `Website enquiry — ${data.get('business') || data.get('name')}`;
    const body = [
      `Name: ${data.get('name')}`,
      `Business: ${data.get('business') || 'Not supplied'}`,
      `Reply email: ${data.get('email')}`,
      `Website needed: ${data.get('type')}`,
      `Guide budget: ${data.get('budget')}`,
      '',
      data.get('message')
    ].join('\n');
    status.hidden = false;
    status.textContent = 'Your email app is opening with the project outline ready to send.';
    window.location.href = `mailto:hello@occono.co.uk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
})();