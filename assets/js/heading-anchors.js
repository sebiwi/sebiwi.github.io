// Add anchor links to all headings
document.addEventListener('DOMContentLoaded', function() {
  const headings = document.querySelectorAll('.post-content h1[id], .post-content h2[id], .post-content h3[id], .post-content h4[id], .post-content h5[id], .post-content h6[id]');

  headings.forEach(function(heading) {
    // Create anchor link
    const anchor = document.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = '#' + heading.id;
    anchor.setAttribute('aria-label', 'Link to this section');
    anchor.innerHTML = '#';

    // Make the heading itself clickable
    heading.style.position = 'relative';
    heading.appendChild(anchor);
  });
});
