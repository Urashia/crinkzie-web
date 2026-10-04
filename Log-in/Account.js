const eyeOpenIcon = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
    </svg>
`;

const eyeOffIcon = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19"></path>
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>
`;

document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.innerHTML = eyeOpenIcon;

    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const isHidden = input.type === 'password';

        input.type = isHidden ? 'text' : 'password';
        btn.innerHTML = isHidden ? eyeOffIcon : eyeOpenIcon;
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
});

// Where to go after signing in.
// Other pages (e.g. Product Detail) can send people here with
// "Account.html?redirect=/path/to/page". Only same-site paths are accepted,
// so nobody can use this link to bounce a customer to another website.
const DEFAULT_AFTER_LOGIN = '/Shop/Shop.html';

function getAfterLoginUrl() {
    const requested = new URLSearchParams(window.location.search).get('redirect');
    if (!requested) return DEFAULT_AFTER_LOGIN;

    try {
        const url = new URL(requested, window.location.origin);
        if (url.origin !== window.location.origin) return DEFAULT_AFTER_LOGIN;
        return url.pathname + url.search + url.hash;
    } catch (err) {
        return DEFAULT_AFTER_LOGIN;
    }
}

const signinForm = document.getElementById('signin-form');

signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    showLoading('Signing you in...');

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    closeAlert();

    if (error) {
        showError(error.message, 'Sign in failed');
        return;
    }

    window.location.href = getAfterLoginUrl();
});