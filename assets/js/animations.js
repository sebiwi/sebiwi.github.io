// Scroll-reveal for post-body images.
// (The staggered page entrance for .fade-in-element is handled purely in CSS
// via the fadeInUp keyframe + nth-child delays — this JS intentionally does
// NOT touch those, to avoid double-handling.)
document.addEventListener('DOMContentLoaded', () => {
  // Honor reduced-motion: don't hide anything, skip the scroll animations.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Elements to animate: images inside post content, revealed as they scroll in.
  const animateElements = document.querySelectorAll('.post-content img');

  // Intersection Observer options. threshold 0 + a negative bottom margin
  // (fire once the element pokes 10% of the viewport in) instead of
  // threshold 0.1: a ratio threshold is unsatisfiable for an image taller
  // than ~10 viewports, which would stay at opacity 0 forever.
  const options = {
    root: null,
    rootMargin: '0px 0px -10% 0px',
    threshold: 0
  };

  // Intersection Observer callback
  const callback = (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  };

  // Create observer
  const observer = new IntersectionObserver(callback, options);

  // Observe elements
  animateElements.forEach(element => {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(element);
  });
});
