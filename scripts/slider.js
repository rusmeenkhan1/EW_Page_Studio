/**
 * Reusable slider: scroll-to-slide, prev/next, indicators, and active-state sync.
 * Does not create DOM; call initSlider(block, options) after the block's slides/controls exist.
 *
 * Options (all optional; defaults match carousel block):
 * - slidesContainer: selector for the scrollable container (e.g. '.carousel-slides')
 * - slideSelector: selector for each slide (e.g. '.carousel-slide')
 * - indicatorsContainer: selector for the indicators list (e.g. '.carousel-slide-indicators')
 * - indicatorItemSelector: selector for each indicator item with data-target-slide (e.g. '.carousel-slide-indicator')
 * - prevSelector: selector for previous button (e.g. '.slide-prev')
 * - nextSelector: selector for next button (e.g. '.slide-next')
 * - activeSlideAttr: block dataset key for current index (e.g. 'activeSlide')
 * - targetSlideAttr: indicator item dataset key for target index (e.g. 'targetSlide')
 * - slideIndexAttr: slide dataset key for its index (e.g. 'slideIndex')
 */

const DEFAULT_OPTIONS = {
  slidesContainer: '.carousel-slides',
  slideSelector: '.carousel-slide',
  indicatorsContainer: '.carousel-slide-indicators',
  indicatorItemSelector: '.carousel-slide-indicator',
  prevSelector: '.slide-prev',
  nextSelector: '.slide-next',
  activeSlideAttr: 'activeSlide',
  targetSlideAttr: 'targetSlide',
  slideIndexAttr: 'slideIndex',
};

const ALLOWED_DATASET_ATTRS = new Set(['activeSlide', 'targetSlide', 'slideIndex']);
const SLIDER_OPTION_KEYS = Object.keys(DEFAULT_OPTIONS);

function getSliderOpts(options) {
  const opts = new Map();
  SLIDER_OPTION_KEYS.forEach((k) => {
    let v = options[k] !== undefined ? options[k] : DEFAULT_OPTIONS[k];
    if (k.endsWith('Attr') && (!ALLOWED_DATASET_ATTRS.has(v) || typeof v !== 'string')) {
      v = DEFAULT_OPTIONS[k];
    }
    opts.set(k, v);
  });
  return opts;
}

function getDatasetAttr(el, attr) {
  if (attr === 'activeSlide') return el.dataset.activeSlide;
  if (attr === 'targetSlide') return el.dataset.targetSlide;
  if (attr === 'slideIndex') return el.dataset.slideIndex;
  return undefined;
}

function setDatasetAttr(el, attr, value) {
  if (attr === 'activeSlide') el.dataset.activeSlide = value;
  else if (attr === 'targetSlide') el.dataset.targetSlide = value;
  else if (attr === 'slideIndex') el.dataset.slideIndex = value;
}

/**
 * Updates block and slide/indicator state to reflect the active slide.
 * @param {Element} block - Root block element
 * @param {Element} slide - The slide that is active
 * @param {Object} options - Selector/dataset options (see DEFAULT_OPTIONS)
 */
export function updateActiveSlide(block, slide, options = {}) {
  const opts = getSliderOpts(options);
  const slideIndexAttr = opts.get('slideIndexAttr');
  const activeSlideAttr = opts.get('activeSlideAttr');
  const slideIndex = parseInt(getDatasetAttr(slide, slideIndexAttr), 10);
  if (Number.isNaN(slideIndex)) return;
  setDatasetAttr(block, activeSlideAttr, slideIndex);

  const slides = block.querySelectorAll(opts.get('slideSelector'));
  slides.forEach((aSlide, idx) => {
    aSlide.setAttribute('aria-hidden', idx !== slideIndex);
    aSlide.querySelectorAll('a').forEach((link) => {
      if (idx !== slideIndex) {
        link.setAttribute('tabindex', '-1');
      } else {
        link.removeAttribute('tabindex');
      }
    });
  });

  const indicators = block.querySelectorAll(opts.get('indicatorItemSelector'));
  indicators.forEach((indicator, idx) => {
    const btn = indicator.querySelector('button');
    if (!btn) return;
    if (idx !== slideIndex) {
      btn.removeAttribute('disabled');
    } else {
      btn.setAttribute('disabled', 'true');
    }
  });
}

/**
 * Returns the slide index that best matches the container's current scroll position
 * (the slide whose left edge is at or just to the left of scrollLeft).
 * @param {Element} container - Scrollable element
 * @param {NodeListOf<Element>} slides - Slide elements
 * @returns {number}
 */
const MAX_SLIDES = 1000;

function getCurrentSlideIndexFromScroll(container, slides) {
  const { scrollLeft } = container;
  const len = Math.min(slides.length, MAX_SLIDES);
  for (let i = 0; i < len; i += 1) {
    const slide = slides[i];
    if (scrollLeft < slide.offsetLeft + slide.offsetWidth) return i;
  }
  return len - 1;
}

/**
 * Scrolls the slider to the given slide index (with wrap).
 * @param {Element} block - Root block element
 * @param {number} slideIndex - Desired slide index
 * @param {string} behavior - 'smooth' or 'auto'
 * @param {Object} options - Selector options
 */
export function showSlide(block, slideIndex = 0, behavior = 'smooth', options = {}) {
  const opts = getSliderOpts(options);
  const container = block.querySelector(opts.get('slidesContainer'));
  const slides = block.querySelectorAll(opts.get('slideSelector'));
  if (!container || !slides.length) return;

  let realSlideIndex = slideIndex < 0 ? slides.length - 1 : slideIndex;
  if (slideIndex >= slides.length) realSlideIndex = 0;
  const activeSlide = slides.item(realSlideIndex);

  activeSlide.querySelectorAll('a').forEach((link) => link.removeAttribute('tabindex'));
  container.scrollTo({
    top: 0,
    left: activeSlide.offsetLeft,
    behavior,
  });
}

/**
 * Binds indicator clicks, prev/next buttons, and IntersectionObserver to sync active state.
 * @param {Element} block - Root block element
 * @param {Object} options - Selector/dataset options
 */
function bindEvents(block, options = {}) {
  const opts = getSliderOpts(options);
  const targetSlideAttr = opts.get('targetSlideAttr');
  const activeSlideAttr = opts.get('activeSlideAttr');

  const slideIndicators = block.querySelector(opts.get('indicatorsContainer'));
  if (slideIndicators) {
    slideIndicators.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', (e) => {
        const indicator = e.currentTarget.closest(opts.get('indicatorItemSelector'));
        if (indicator) {
          const target = parseInt(getDatasetAttr(indicator, targetSlideAttr), 10);
          if (!Number.isNaN(target)) showSlide(block, target, 'smooth', options);
        }
      });
    });
  }

  const prevBtn = block.querySelector(opts.get('prevSelector'));
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const container = block.querySelector(opts.get('slidesContainer'));
      const slides = block.querySelectorAll(opts.get('slideSelector'));
      const current = container && slides.length
        ? getCurrentSlideIndexFromScroll(container, slides)
        : parseInt(getDatasetAttr(block, activeSlideAttr), 10) || 0;
      showSlide(block, current - 1, 'smooth', options);
    });
  }

  const nextBtn = block.querySelector(opts.get('nextSelector'));
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const container = block.querySelector(opts.get('slidesContainer'));
      const slides = block.querySelectorAll(opts.get('slideSelector'));
      const current = container && slides.length
        ? getCurrentSlideIndexFromScroll(container, slides)
        : parseInt(getDatasetAttr(block, activeSlideAttr), 10) || 0;
      showSlide(block, current + 1, 'smooth', options);
    });
  }

  const slideObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) updateActiveSlide(block, entry.target, options);
    });
  }, { threshold: 0.5 });

  block.querySelectorAll(opts.get('slideSelector')).forEach((slide) => {
    slideObserver.observe(slide);
  });
}

/**
 * Default options for createSliderControls (class names and labels).
 * Override when creating controls for a different block (e.g. card-carousel).
 */
const DEFAULT_CONTROL_OPTIONS = {
  listClass: 'carousel-slide-indicators',
  indicatorItemClass: 'carousel-slide-indicator',
  navButtonsWrapperClass: 'carousel-navigation-buttons',
  prevClass: 'slide-prev',
  nextClass: 'slide-next',
  indicatorsAriaLabel: 'Carousel Slide Controls',
  prevAriaLabel: 'Previous Slide',
  nextAriaLabel: 'Next Slide',
  /** @param {number} index - 0-based slide index @param {number} total - slide count */
  indicatorAriaLabel: (index, total) => `Show Slide ${index + 1} of ${total}`,
};

const CONTROL_OPTION_KEYS = Object.keys(DEFAULT_CONTROL_OPTIONS);

function getControlOpts(options) {
  const opts = new Map();
  CONTROL_OPTION_KEYS.forEach((k) => {
    opts.set(k, options[k] !== undefined ? options[k] : DEFAULT_CONTROL_OPTIONS[k]);
  });
  return opts;
}

/**
 * Creates the DOM for slider controls: indicators nav (ol with one li per slide) and prev/next buttons.
 * Caller is responsible for appending indicatorsNav and buttonsContainer to the block/container.
 * @param {number} slideCount - Number of slides (and indicator dots)
 * @param {Object} options - Optional overrides for class names and aria labels (see DEFAULT_CONTROL_OPTIONS)
 * @returns {{ indicatorsNav: HTMLElement, buttonsContainer: HTMLElement }}
 */
export function createSliderControls(slideCount, options = {}) {
  const opts = getControlOpts(options);

  const indicatorsNav = document.createElement('nav');
  indicatorsNav.setAttribute('aria-label', opts.get('indicatorsAriaLabel'));
  const list = document.createElement('ol');
  list.classList.add(opts.get('listClass'));

  const count = Math.min(Math.max(0, slideCount), MAX_SLIDES);
  for (let idx = 0; idx < count; idx += 1) {
    const indicator = document.createElement('li');
    indicator.classList.add(opts.get('indicatorItemClass'));
    indicator.setAttribute('data-target-slide', String(idx));
    const btn = document.createElement('button');
    btn.type = 'button';
    const labelFn = opts.get('indicatorAriaLabel');
    btn.setAttribute('aria-label', typeof labelFn === 'function'
      ? labelFn(idx, slideCount)
      : labelFn);
    indicator.append(btn);
    list.append(indicator);
  }
  indicatorsNav.append(list);

  const buttonsContainer = document.createElement('div');
  buttonsContainer.classList.add(opts.get('navButtonsWrapperClass'));
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.classList.add(opts.get('prevClass'));
  prevBtn.setAttribute('aria-label', opts.get('prevAriaLabel'));
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.classList.add(opts.get('nextClass'));
  nextBtn.setAttribute('aria-label', opts.get('nextAriaLabel'));
  buttonsContainer.append(prevBtn, nextBtn);

  return { indicatorsNav, buttonsContainer };
}

/**
 * Initializes slider behavior on a block: binds controls and observes slides.
 * Call after the block's slides and controls (indicators, prev/next) are in the DOM.
 * @param {Element} block - Root block element
 * @param {Object} options - Optional overrides for selectors/dataset names
 */
export function initSlider(block, options = {}) {
  bindEvents(block, { ...DEFAULT_OPTIONS, ...options });
}
