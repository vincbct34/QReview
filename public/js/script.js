// Load reviews on page load
document.addEventListener('DOMContentLoaded', () => {
  loadReviews();
  loadQRCode();
});

// Load reviews from API
async function loadReviews() {
  const reviewsList = document.getElementById('reviews-list');

  try {
    const response = await fetch('/api/reviews');
    const reviews = await response.json();

    if (reviews.length === 0) {
      reviewsList.innerHTML = '<p class="no-reviews">Aucun avis publié pour le moment. Soyez le premier à laisser votre avis !</p>';
      return;
    }

    reviewsList.innerHTML = reviews.map(review => `
      <div class="review-card">
        <div class="review-header">
          <span class="company-name">${escapeHtml(review.company_name)}</span>
          <span class="review-stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
        </div>
        <div class="review-meta">
          <span>👤 ${escapeHtml(review.position)}</span>
          <span>⏱️ ${escapeHtml(review.duration)}</span>
        </div>
        ${review.comment ? `<p class="review-comment">${escapeHtml(review.comment)}</p>` : ''}
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading reviews:', error);
    reviewsList.innerHTML = '<p class="loading">Erreur lors du chargement des avis.</p>';
  }
}

// Load QR Code
async function loadQRCode() {
  const container = document.getElementById('qrcode-container');
  const urlDisplay = document.getElementById('current-url');

  try {
    const response = await fetch('/api/qrcode');
    const data = await response.json();

    container.innerHTML = `<img src="${data.qrCode}" alt="QR Code pour QReview">`;
    urlDisplay.textContent = data.url;
  } catch (error) {
    console.error('Error loading QR code:', error);
    container.innerHTML = '<p class="loading">Erreur lors de la gnration du QR code.</p>';
  }
}

// Handle form submission
document.getElementById('review-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = {
    company_name: formData.get('company'),
    position: formData.get('position'),
    duration: formData.get('duration'),
    email: formData.get('email'),
    rating: formData.get('rating'),
    comment: formData.get('comment') || null
  };

  if (!data.rating) {
    alert('Veuillez sélectionner une note.');
    return;
  }

  try {
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to submit review');
    }

    // Show success modal
    showModal();
    e.target.reset();
  } catch (error) {
    console.error('Error submitting review:', error);
    alert('Erreur lors de l\'envoi de l\'avis. Veuillez ressayer.');
  }
});

// Modal functions
function showModal() {
  document.getElementById('success-modal').classList.add('show');
}

function closeModal() {
  document.getElementById('success-modal').classList.remove('show');
}

// Close modal on X click
document.querySelector('.close').addEventListener('click', closeModal);

// Close modal on outside click
document.getElementById('success-modal').addEventListener('click', (e) => {
  if (e.target.id === 'success-modal') {
    closeModal();
  }
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
