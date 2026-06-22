// Add anchor links to all headings
document.addEventListener('DOMContentLoaded', function() {
  const headings = document.querySelectorAll('.post-content h1[id], .post-content h2[id], .post-content h3[id], .post-content h4[id], .post-content h5[id], .post-content h6[id]');

  headings.forEach(function(heading) {
    // Create anchor link. Read the heading text before appending the anchor so
    // the label is the clean section title, and give each anchor a unique,
    // descriptive label (a generic "Link to this section" repeated on every
    // heading is useless in a screen reader's links list). The visible "#" is
    // decorative — hidden from assistive tech, which uses the aria-label.
    const label = heading.textContent.trim();
    const anchor = document.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = '#' + heading.id;
    anchor.setAttribute('aria-label', label ? 'Link to section: ' + label : 'Link to this section');
    anchor.innerHTML = '<span aria-hidden="true">#</span>';

    // Make the heading itself clickable
    heading.style.position = 'relative';
    heading.appendChild(anchor);
  });
});
