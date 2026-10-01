const steps = document.querySelectorAll('.form-step');
const dots = document.querySelectorAll('.dot');

const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');

let currentStep = 1;
const totalSteps = steps.length;


// ========================================
// PASSWORD EYE ICONS
// ========================================

const eyeOpenIcon = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
    </svg>
`;

const eyeOffIcon = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19"></path>
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>
`;


// ========================================
// VALIDATE CURRENT STEP
// ========================================

function validateStep(stepEl) {

    const inputs = stepEl.querySelectorAll('input[required]');

    let allValid = true;

    inputs.forEach(input => {

        const group = input.closest('.input-group');

        const isValid = input.checkValidity();

        group.classList.toggle('invalid', !isValid);

        if (!isValid) {

            const errorSpan =
                group.querySelector('.error-message');

            if (errorSpan) {
                errorSpan.textContent =
                    input.validationMessage;
            }

            allValid = false;
        }
    });

    return allValid;
}


// ========================================
// UPDATE FORM STEP
// ========================================

function updateStep() {

    steps.forEach(step => {

        step.classList.toggle(
            'active',
            Number(step.dataset.step) === currentStep
        );
    });


    dots.forEach(dot => {

        const dotNum =
            Number(dot.dataset.dot);

        dot.classList.remove(
            'completed',
            'current'
        );

        if (dotNum < currentStep) {

            dot.classList.add('completed');

        } else if (dotNum === currentStep) {

            dot.classList.add('current');
        }
    });


    // Hide Next button on final step
    nextBtn.style.display =
        currentStep === totalSteps
            ? 'none'
            : 'flex';


    // Hide Previous button on first step
    prevBtn.style.display =
        currentStep === 1
            ? 'none'
            : 'flex';
}


// ========================================
// NEXT BUTTON
// ========================================

nextBtn.addEventListener('click', () => {

    const currentStepEl =
        document.querySelector(
            `.form-step[data-step="${currentStep}"]`
        );

    if (!validateStep(currentStepEl)) {
        return;
    }

    if (currentStep < totalSteps) {

        currentStep++;

        updateStep();
    }
});


// ========================================
// PREVIOUS BUTTON
// ========================================

prevBtn.addEventListener('click', () => {

    if (currentStep > 1) {

        currentStep--;

        updateStep();
    }
});


// ========================================
// SHOW / HIDE PASSWORD
// ========================================

document
    .querySelectorAll('.toggle-password')
    .forEach(btn => {

        btn.innerHTML = eyeOpenIcon;

        btn.addEventListener('click', () => {

            const input =
                document.getElementById(
                    btn.dataset.target
                );

            const isHidden =
                input.type === 'password';

            input.type =
                isHidden
                    ? 'text'
                    : 'password';

            btn.innerHTML =
                isHidden
                    ? eyeOffIcon
                    : eyeOpenIcon;

            btn.setAttribute(
                'aria-label',
                isHidden
                    ? 'Hide password'
                    : 'Show password'
            );
        });
    });


// ========================================
// REMOVE ERROR WHEN USER TYPES
// ========================================

document
    .querySelectorAll('.input-group input')
    .forEach(input => {

        input.addEventListener('input', () => {

            input
                .closest('.input-group')
                .classList
                .remove('invalid');
        });
    });


// ========================================
// CONTACT NUMBER FORMATTING
// ========================================

const contactInput =
    document.getElementById('contact');

contactInput.addEventListener('input', () => {

    // Remove non-numbers
    let digits =
        contactInput.value.replace(/\D/g, '');

    // Maximum 11 digits
    digits =
        digits.slice(0, 11);

    let formatted = digits;


    // Example:
    // 09123456789
    // becomes:
    // 0912 345 6789

    if (digits.length > 4) {

        formatted =
            digits.slice(0, 4) +
            ' ' +
            digits.slice(4);
    }


    if (digits.length > 7) {

        formatted =
            digits.slice(0, 4) +
            ' ' +
            digits.slice(4, 7) +
            ' ' +
            digits.slice(7);
    }


    contactInput.value = formatted;
});


// ========================================
// FORM ELEMENTS
// ========================================

const form =
    document.getElementById('signup-form');

const passwordInput =
    document.getElementById('password');

const confirmInput =
    document.getElementById('confirm-password');


// ========================================
// CHECK PASSWORDS MATCH
// ========================================

function checkPasswordsMatch() {

    const group =
        confirmInput.closest('.input-group');

    const errorSpan =
        group.querySelector('.error-message');


    if (
        confirmInput.value === '' ||
        passwordInput.value === confirmInput.value
    ) {

        group.classList.remove('invalid');

        return true;
    }


    group.classList.add('invalid');


    if (errorSpan) {

        errorSpan.textContent =
            'Passwords do not match.';
    }


    return false;
}


confirmInput.addEventListener(
    'input',
    checkPasswordsMatch
);

passwordInput.addEventListener(
    'input',
    checkPasswordsMatch
);


// ========================================
// SIGN UP
// ========================================

form.addEventListener('submit', async (e) => {

    e.preventDefault();


    // ----------------------------------------
    // Validate Step 3
    // ----------------------------------------

    const step3 =
        document.querySelector(
            '.form-step[data-step="3"]'
        );

    if (!validateStep(step3)) {
        return;
    }


    // ----------------------------------------
    // Check passwords
    // ----------------------------------------

    if (!checkPasswordsMatch()) {
        return;
    }


    // ========================================
    // GET FORM VALUES
    // ========================================

    const email =
        document
            .getElementById('email')
            .value
            .trim();

    const fullName =
        document
            .getElementById('name')
            .value
            .trim();

    const studentId =
        document
            .getElementById('student-id')
            .value
            .trim();

    const yearSection =
        document
            .getElementById('year-section')
            .value
            .trim();

    const phone =
        contactInput.value.trim();

    const address =
        document
            .getElementById('address')
            .value
            .trim();

    const school =
        document
            .getElementById('school')
            .value
            .trim();


    // ========================================
    // SUPABASE SIGN UP
    // ========================================

    const { data, error } =
        await supabaseClient.auth.signUp({

            // User's email
            email: email,

            // User's password
            password: passwordInput.value,


            // ========================================
            // SUPABASE OPTIONS
            // ========================================

            options: {

                // ----------------------------------------
                // IMPORTANT:
                // After the user confirms their email,
                // Supabase redirects them to Home.html
                // ----------------------------------------

                emailRedirectTo:
                    'http://127.0.0.1:5500/Landing/Home.html',


                // ----------------------------------------
                // Extra profile information
                // ----------------------------------------

                data: {

                    full_name:
                        fullName,

                    student_id:
                        studentId,

                    year_section:
                        yearSection,

                    phone:
                        phone,

                    address:
                        address,

                    school:
                        school
                }
            }
        });


    // ========================================
    // HANDLE SIGNUP ERROR
    // ========================================

    if (error) {

        console.error(
            'Sign up error:',
            error
        );

        alert(
            'Sign up failed: ' +
            error.message
        );

        return;
    }


    // ========================================
    // SIGNUP SUCCESS
    // ========================================

    console.log(
        'Account created successfully:',
        data
    );


    alert(
        'Account created! Please check your email and click the confirmation link.'
    );


    // IMPORTANT:
    //
    // DO NOT redirect here.
    //
    // The user must confirm their email first.
    //
    // After confirmation, Supabase will redirect
    // them automatically to:
    //
    // http://127.0.0.1:5500/Landing/Home.html
});


// ========================================
// INITIALIZE FORM
// ========================================

updateStep();