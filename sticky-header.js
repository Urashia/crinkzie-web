(function () {
    const header = document.querySelector('header');
    if (!header) return;

    const ADD_THRESHOLD = 50;
    const REMOVE_THRESHOLD = 30; // lower than ADD, creates a "dead zone" so it can't flicker

    function updateHeaderState() {
        if (window.scrollY > ADD_THRESHOLD) {
            header.classList.add('scrolled');
        } else if (window.scrollY < REMOVE_THRESHOLD) {
            header.classList.remove('scrolled');
        }
        // between 30-50px scrollY, we do nothing — that gap is what stops the class from
        // flipping back and forth right at the edge
    }

    window.addEventListener('scroll', updateHeaderState, { passive: true });
    updateHeaderState();
})();