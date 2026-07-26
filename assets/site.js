(() => {
  const refinementStyles = document.createElement('link');
  refinementStyles.rel = 'stylesheet';
  refinementStyles.href = 'assets/hero-refinement.css';
  document.head.appendChild(refinementStyles);

  const mobileStyles = document.createElement('link');
  mobileStyles.rel = 'stylesheet';
  mobileStyles.href = 'assets/mobile-audit.css';
  document.head.appendChild(mobileStyles);

  const previewStyles = document.createElement('link');
  previewStyles.rel = 'stylesheet';
  previewStyles.href = 'assets/preview-viewport-fix.css';
  document.head.appendChild(previewStyles);

  const header = document.querySelector('.site-header');
  if (header) {
    const updateHeaderState = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    updateHeaderState();
    window.addEventListener('scroll', updateHeaderState, { passive: true });
  }

  const previews = document.querySelectorAll('.browser iframe, .mini-browser iframe');
  previews.forEach((preview) => {
    preview.setAttribute('scrolling', 'no');
    preview.setAttribute('tabindex', '-1');
    preview.setAttribute('aria-hidden', 'true');
    preview.style.pointerEvents = 'none';
    preview.style.overflow = 'hidden';
  });

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxHHO_pKu_KR587oLPwtEtRijWN6SXzAFSZE-CIgJyxTx8Edqd-zj6tNchmPkKLiRMB/exec';
  const form = document.getElementById('project-form');
  if (!form) return;

  const status = form.querySelector('.form-status');
  const submitButton = form.querySelector('button[type="submit"]');
  const deliveryNote = form.querySelector('.submit-row small');
  const defaultButtonText = submitButton ? submitButton.textContent : '';

  if (deliveryNote) {
    deliveryNote.textContent = 'Your details are sent directly and securely to Occono.';
  }

  const setStatus = (message, state, allowHtml = false) => {
    if (!status) return;
    status.hidden = false;
    if (allowHtml) {
      status.innerHTML = message;
    } else {
      status.textContent = message;
    }
    status.dataset.state = state;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = new FormData(form);
    const payload = {
      name: data.get('name') || '',
      business: data.get('business') || '',
      email: data.get('email') || '',
      websiteType: data.get('type') || '',
      guideBudget: data.get('budget') || '',
      message: data.get('message') || '',
      source: 'Occono website',
      website: data.get('website') || ''
    };

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending…';
    }
    setStatus('Sending your website outline…', 'pending');

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.message || 'Your enquiry could not be submitted.');
      }

      form.reset();
      setStatus('Thank you. Your website outline has been sent and we will reply personally.', 'success');
    } catch (error) {
      console.error('Occono contact form submission failed:', error);
      setStatus(
        'Sorry, your enquiry could not be sent. Please email <a href="mailto:hello@occono.co.uk">hello@occono.co.uk</a>.',
        'error',
        true
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
      }
    }
  });
})();