/* =========================================================
   auth-header.js
   -----------------------------------------------------------
   Keeps the header/footer in sync with the logged-in session:
     - Account/Profile link + label (unchanged from before)
     - Cart icon: now points at the real Cart page from wherever
       the current page lives, and shows a small badge with how
       many items are in the user's cart — LIVE, reads
       "cart_items" scoped to the logged-in user
--------------------------------------------------------- */

async function updateAuthUI() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    updateHeaderForAuth(session);
    updateFooterForAuth(session);
    updateCartLink(session);
}

function updateHeaderForAuth(session) {
    const accountLink = document.querySelector('.header-icons a[aria-label="Account"]');
    if (!accountLink) return;

    const inLoginFolder = window.location.pathname.includes('/Log-in/');
    const basePath = inLoginFolder ? '' : '../Log-in/';

    if (session) {
        accountLink.href = basePath + 'Profile.html';
        accountLink.setAttribute('aria-label', 'Profile');
    } else {
        accountLink.href = basePath + 'Account.html';
        accountLink.setAttribute('aria-label', 'Account');
    }
}

function updateFooterForAuth(session) {
    const footerAccountLink = document.querySelector('#footer-account-link');
    if (!footerAccountLink) return;

    const inLoginFolder = window.location.pathname.includes('/Log-in/');
    const basePath = inLoginFolder ? '' : '../Log-in/';

    if (session) {
        footerAccountLink.href = basePath + 'Profile.html';
        footerAccountLink.textContent = 'Profile';
    } else {
        footerAccountLink.href = basePath + 'Account.html';
        footerAccountLink.textContent = 'Account';
    }
}

/* ---------------------------------------------------------
   CART ICON — real link + live item-count badge
--------------------------------------------------------- */
async function updateCartLink(session) {
    const cartLink = document.querySelector('.header-icons a[aria-label="Cart"]');
    if (!cartLink) return;

    // Point the icon at the real Cart page, worked out from wherever this
    // page lives — same basePath trick as the Account/Profile link above.
    // Cart.html lives in the "Checkout" folder.
    const inCartFolder = window.location.pathname.includes('/Checkout/');
    cartLink.href = inCartFolder ? 'Cart.html' : '../Checkout/Cart.html';

    injectCartBadgeStyles();

    // Clear any existing badge before deciding whether to show a new one,
    // so it doesn't just keep growing extra badges on repeat calls.
    const existingBadge = cartLink.querySelector('.cart-badge');
    if (existingBadge) existingBadge.remove();

    if (!session) return; // logged-out visitors have no server-side cart to count

    const { count, error } = await supabaseClient
        .from('cart_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id);

    if (error) {
        console.error('Failed to load cart count:', error);
        return;
    }

    if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'cart-badge';
        badge.textContent = count > 99 ? '99+' : String(count);
        cartLink.appendChild(badge);
    }
}

// Injected once, so the badge works everywhere this script runs without
// needing a matching edit in Common.css.
function injectCartBadgeStyles() {
    if (document.getElementById('cart-badge-styles')) return;

    const style = document.createElement('style');
    style.id = 'cart-badge-styles';
    style.textContent = `
        .header-icons a[aria-label="Cart"] {
            position: relative;
        }
        .cart-badge {
            position: absolute;
            top: -6px;
            right: -8px;
            min-width: 16px;
            height: 16px;
            padding: 0 4px;
            border-radius: 999px;
            background: #E0A94C;
            color: #210F04;
            font-size: 10px;
            font-weight: 800;
            line-height: 16px;
            text-align: center;
            font-family: 'Quicksand', sans-serif;
        }
    `;
    document.head.appendChild(style);
}

updateAuthUI();