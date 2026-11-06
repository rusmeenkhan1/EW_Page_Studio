import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, getBlockId } from '../../scripts/scripts.js';
import { createSliderControls, initSlider, showSlide } from '../../scripts/slider.js';
import { createCard } from '../card/card.js';

export default function decorate(block) {
  const blockId = getBlockId('card-carousel');
  block.setAttribute('id', blockId);
  block.setAttribute('aria-label', `carousel-${blockId}`);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Carousel');

  const rows = [...block.children];
  const isSingleSlide = rows.length < 2;

  const container = document.createElement('div');
  container.classList.add('card-carousel-slides-container');

  const slidesWrapper = document.createElement('ul');
  slidesWrapper.classList.add('card-carousel-slides');
  slidesWrapper.setAttribute('tabindex', '0');
  slidesWrapper.setAttribute('aria-label', 'Card carousel slides');

  if (!isSingleSlide) {
    // eslint-disable-next-line
    const { indicatorsNav, buttonsContainer } = createSliderControls(rows.length, {
      indicatorsAriaLabel: `Card Carousel Slide Controls for ${blockId}`,
    });
    // uncomment if you want to show dot navigation
    // block.append(indicatorsNav);
    container.append(buttonsContainer);
  }

  rows.forEach((row, idx) => {
    const card = createCard(row);
    card.classList.add('card-carousel-slide');
    card.dataset.slideIndex = idx;
    slidesWrapper.append(card);
    row.remove();
  });

  slidesWrapper.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });

  container.append(slidesWrapper);
  block.prepend(container);

  if (!isSingleSlide) {
    initSlider(block, {
      slidesContainer: '.card-carousel-slides',
      slideSelector: '.card-carousel-slide',
      // uncomment if you want to show dot navigation
      // indicatorsContainer: '.carousel-slide-indicators',
      // indicatorItemSelector: '.carousel-slide-indicator',
      prevSelector: '.slide-prev',
      nextSelector: '.slide-next',
    });
    slidesWrapper.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const current = parseInt(block.dataset.activeSlide, 10) || 0;
      const next = e.key === 'ArrowLeft' ? current - 1 : current + 1;
      e.preventDefault();
      showSlide(block, next, 'smooth', {
        slidesContainer: '.card-carousel-slides',
        slideSelector: '.card-carousel-slide',
        // uncomment if you want to show dot navigation
        // indicatorsContainer: '.carousel-slide-indicators',
        // indicatorItemSelector: '.carousel-slide-indicator',
        prevSelector: '.slide-prev',
        nextSelector: '.slide-next',
      });
    });
  }
}
