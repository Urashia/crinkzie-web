const form = document.getElementById('admin-login-form');
const errorMsg = document.getElementById('login-error');
const togglePasswordBtn = document.getElementById('toggle-password');
const passwordInput = document.getElementById('admin-password');

togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.classList.remove('show');
    errorMsg.textContent = '';

    const email = document.getElementById('admin-email').value.trim();
    const password = passwordInput.value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        errorMsg.textContent = 'Invalid email or password.';
        errorMsg.classList.add('show');
        return;
    }

    const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', data.user.id)
        .single();

    // Debugging log to inspect database response
    console.log('Profile Query Result:', { profile, profileError });

    if (profileError || !profile || !profile.is_admin) {
        errorMsg.textContent = 'This account does not have admin access.';
        errorMsg.classList.add('show');
        await supabaseClient.auth.signOut();
        return;
    }

    window.location.href = 'Dashboard.html';
});