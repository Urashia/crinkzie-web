document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('header');
    const nav = header ? header.querySelector('nav') : null;
    if (!header || !nav) return;

    // Hamburger button (goes first inside the header)
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'menu-toggle';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    header.prepend(toggle);

    // Dark overlay behind the menu
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    header.appendChild(overlay);

    // Top of the menu: logo + close button
    const head = document.createElement('div');
    head.className = 'drawer-head';

    const logoImg = header.querySelector('.logo img');
    if (logoImg) head.appendChild(logoImg.cloneNode());

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'menu-close';
    close.setAttribute('aria-label', 'Close menu');
    close.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';
    head.appendChild(close);
    nav.prepend(head);

    function openMenu() {
        nav.classList.add('open');
        overlay.classList.add('open');
        document.body.classList.add('menu-open');
        toggle.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
        nav.classList.remove('open');
        overlay.classList.remove('open');
        document.body.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', openMenu);
    close.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 768) closeMenu(); });
});