/* =========================================================
   ProductDetail.js
   -----------------------------------------------------------
   STATUS:
   1. getProduct()      -> LIVE — queries "products" by ?id= in the URL
   2. getReviews()      -> LIVE — reads "reviews" filtered by product_id
   3. getCurrentUser()  -> LIVE — reads the Supabase session + "profiles"
                            row, so Order Summary's Customer Information
                            fields and the review modal's "Reviewing as"
                            pull from the real logged-in profile
   4. submitReview()    -> LIVE — inserts into "reviews"
   5. Order creation    -> LIVE — see PaymentFlow.js (createRealOrder,
                            processEwalletPayment). This file must load
                            PaymentFlow.js via a <script> tag before
                            this one in ProductDetail.html.

   CHECKOUT RULES (new):
   - "Buy Now" requires a login. Logged-out visitors get a popup asking
     them to log in or create an account first.
   - The Customer Information fields in Order Summary are LOCKED
     (read-only). They always show the logged-in profile and cannot be
     edited. Place Order also uses the profile values, not the inputs.

   Requires SweetAlert2 + alerts.js to be loaded before this file.

   NOTE: single-photo only. Products have one image_url column —
   there's no gallery, no thumbnails, no prev/next.
--------------------------------------------------------- */

/* ---------------------------------------------------------
   REAL TABLE SHAPES (confirmed against Supabase, matches
   what Admin/Orders.js already reads)

   products
     id, name, variant, price, stock, description, image_url, created_at

   profiles   (id matches auth.users.id)
     id, full_name, student_id, year_section, email, phone, address, school

   reviews
     id, product_id, reviewer_id, reviewer_name, reviewer_avatar,
     rating, comment, created_at

   orders
     id, user_id, status, payment_reference, total_amount, created_at

   order_items
     id, order_id, product_id, product_name, quantity, price
--------------------------------------------------------- */

const LOGIN_PAGE_PATH = "../Log-in/Account.html";
const SIGNUP_PAGE_PATH = "../Log-in/Creation.html";

// Login link that sends the customer back to THIS page after signing in
function getLoginUrl() {
    return LOGIN_PAGE_PATH + "?redirect=" +
        encodeURIComponent(window.location.pathname + window.location.search);
}

const SORT_OPTIONS = [
    { value: "recent", label: "Most Recent" },
    { value: "5", label: "5 Star" },
    { value: "4", label: "4 Star" },
    { value: "3", label: "3 Star" },
    { value: "2", label: "2 Star" },
    { value: "1", label: "1 Star" }
];

const DELIVERY_LOCATION = "UCC Congress (Campus)";
const DELIVERY_NOTE = "Please note: All orders are delivered within UCC Congress only, as stated in our Terms of Service.";

const PAYMENT_METHODS = [
    { value: "pickup", label: "Cash", note: "Please prepare the exact amount. Pay when you claim your order at UCC Congress." },
    { value: "ewallet", label: "E-wallet", note: "Take a screenshot of the QR code and pay using your preferred e-wallet." }
];

const DEMO_MANY_ORDER_ITEMS = false;

let currentProduct = null;
let allReviews = [];
let currentSort = "recent";
let selectedRating = 0;
let activeUser = null;
let orderItems = [];
let selectedPayment = "pickup";

async function getProduct() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        console.error('Failed to load product:', error);
        return null;
    }

    return {
        id: data.id,
        name: data.name,
        price: data.price,
        description: data.description || "",
        image_url: data.image_url || null
    };
}

async function getReviews() {
    const { data, error } = await supabaseClient
        .from('reviews')
        .select('*')
        .eq('product_id', currentProduct.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load reviews:', error);
        return [];
    }
    return data;
}

async function getCurrentUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return null;

    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error || !profile) {
        console.error('Failed to load profile:', error);
        return null;
    }

    return {
        id: session.user.id,
        name: profile.full_name,
        avatar_url: null,
        contact_number: profile.phone,
        // falls back to the login email if the profile row has none
        email: profile.email || session.user.email
    };
}

/* ---------------------------------------------------------
   LOGIN REQUIRED POPUP
   Shown when a logged-out visitor tries to check out.
--------------------------------------------------------- */
async function promptLoginRequired() {
    // Safety net: if SweetAlert2 somehow isn't loaded, just go to login.
    if (typeof Swal === "undefined") {
        window.location.href = getLoginUrl();
        return;
    }

    const result = await Swal.fire({
        title: "Log in to continue",
        text: "You need an account to check out. Please log in or create one first.",
        icon: "info",
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: "Log in",
        denyButtonText: "Create account",
        cancelButtonText: "Not now",
        confirmButtonColor: "#210F04",
        denyButtonColor: "#C98A4B",
        cancelButtonColor: "#8a8a8a",
        reverseButtons: true
    });

    if (result.isConfirmed) {
        window.location.href = getLoginUrl();
    } else if (result.isDenied) {
        window.location.href = SIGNUP_PAGE_PATH;
    }
}

async function submitReview(newReview) {
    const { data, error } = await supabaseClient
        .from('reviews')
        .insert([{
            product_id: currentProduct.id,
            reviewer_id: newReview.reviewer_id,
            reviewer_name: newReview.reviewer_name,
            reviewer_avatar: newReview.reviewer_avatar,
            rating: newReview.rating,
            comment: newReview.comment
        }])
        .select();

    if (error || !data || !data[0]) {
        console.error('Failed to submit review:', error);
        await showError("We couldn't save your review. Please try again.");
        return null;
    }
    return data[0];
}

async function addToCart(productId, qty) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return "logged-out";

    const { data: existing, error: fetchError } = await supabaseClient
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', session.user.id)
        .eq('product_id', productId)
        .maybeSingle();

    if (fetchError) {
        console.error('Failed to check cart:', fetchError);
        return "error";
    }

    if (existing) {
        const { error: updateError } = await supabaseClient
            .from('cart_items')
            .update({ quantity: existing.quantity + qty })
            .eq('id', existing.id);

        if (updateError) {
            console.error('Failed to update cart quantity:', updateError);
            return "error";
        }
    } else {
        const { error: insertError } = await supabaseClient
            .from('cart_items')
            .insert([{ user_id: session.user.id, product_id: productId, quantity: qty }]);

        if (insertError) {
            console.error('Failed to add to cart:', insertError);
            return "error";
        }
    }

    return "ok";
}

function getInitials(name) {
    return name
        .trim()
        .split(/\s+/)
        .map(w => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

const AVATAR_COLORS = ["#7B4B2A", "#4A6B4A", "#4A5B7B", "#8A4A5B", "#6B5B4A", "#4A7B6B"];
function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function renderAvatar(name, avatarUrl) {
    if (avatarUrl) {
        return `<img src="${avatarUrl}" alt="${name}">`;
    }
    return getInitials(name);
}

function avatarStyle(name, avatarUrl) {
    return avatarUrl ? "" : `style="background:${getAvatarColor(name)}"`;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function truncateComment(text, limit = 150) {
    if (text.length <= limit) return text;
    return text.slice(0, limit).trim() + "...";
}

function renderStars(rating) {
    const full = Math.round(rating);
    let html = "";
    for (let i = 1; i <= 5; i++) {
        html += `<span class="star ${i <= full ? "filled" : ""}">★</span>`;
    }
    return html;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

function peso(amount, withDecimals = true) {
    return "₱ " + Number(amount).toLocaleString("en-PH", {
        minimumFractionDigits: withDecimals ? 2 : 0,
        maximumFractionDigits: withDecimals ? 2 : 0
    });
}

function lockPageScroll() {
    document.body.style.overflow = "hidden";
}
function unlockPageScroll() {
    document.body.style.overflow = "";
}

const ICONS = {
    filter: `<svg class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"></path></svg>`,
    chevron: `<svg class="sort-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"></path></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"></polygon></svg>`,
    bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="14" rx="3"></rect><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"></path><path d="M3 11h18"></path></svg>`
};

function renderSortOption(opt) {
    const icon = opt.value === "recent" ? ICONS.clock : ICONS.star;
    return `
        <li class="sort-option ${opt.value === "recent" ? "active" : ""}" data-value="${opt.value}" data-label="${opt.label}">
            <span class="sort-check">${ICONS.check}</span>
            <span class="sort-option-icon">${icon}</span>
            <span>${opt.label}</span>
        </li>
    `;
}

function renderProductDetail(product) {
    const section = document.getElementById("product-detail");

    section.innerHTML = `
        <div class="gallery">
            <div class="detail-image" id="gallery-main-image"></div>
        </div>

        <div class="detail-info">
            <h1>${product.name}</h1>
            <div class="detail-rating" id="detail-rating-line"></div>
            <p class="detail-price">₱ ${product.price.toLocaleString()}</p>
            <p class="detail-desc">${product.description}</p>

            <div class="quantity-selector">
                <button id="qty-decrease" type="button">−</button>
                <input id="qty-input" type="text" value="1" readonly>
                <button id="qty-increase" type="button">+</button>
            </div>

            <div class="detail-actions">
                <button class="add-to-cart-btn" id="add-to-cart-btn">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <circle cx="9" cy="21" r="1"></circle>
               <circle cx="20" cy="21" r="1"></circle>
               <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
           </svg>
           Add to Cart
       </button>
                <button class="buy-now-btn" id="buy-now-btn">Buy Now</button>
            </div>
        </div>

        <section class="reviews-section">
            <h2>Customer Reviews</h2>

            <div class="reviews-layout">
                <div class="rating-summary" id="rating-summary"></div>

                <div class="reviews-list-panel">
                    <div class="reviews-toolbar">
                        <button class="write-review-btn" id="write-review-btn">✎ Write a Review</button>

                        <div class="sort-dropdown" id="sort-dropdown">
                            <button type="button" class="sort-trigger" id="sort-trigger">
                                ${ICONS.filter}
                                <span id="sort-trigger-label">Sort by: Most Recent</span>
                                ${ICONS.chevron}
                            </button>
                            <ul class="sort-menu" id="sort-menu">
                                ${SORT_OPTIONS.map(renderSortOption).join("")}
                            </ul>
                        </div>
                    </div>
                    <div class="reviews-list" id="reviews-list"></div>
                </div>
            </div>
        </section>

        <div class="modal-overlay" id="review-modal-overlay">
            <div class="modal" role="dialog" aria-modal="true">
                <button class="modal-close" id="modal-close-btn" aria-label="Close">×</button>
                <h3>Write a Review</h3>
                <form id="review-form">
                    <label>Reviewing as</label>
                    <div class="reviewing-as" id="reviewing-as"></div>

                    <label>Rating</label>
                    <div class="star-input" id="star-input">
                        ${[1, 2, 3, 4, 5].map(i => `<span class="star-choice" data-value="${i}">★</span>`).join("")}
                    </div>

                    <label for="review-comment">Comment</label>
                    <textarea id="review-comment" required maxlength="150" placeholder="Share your thoughts about this product..."></textarea>
                    <div class="char-count"><span id="char-count-val">0</span>/150</div>

                    <button type="submit" class="submit-review-btn">Submit Review</button>
                </form>
            </div>
        </div>

        <!-- ORDER SUMMARY MODAL (opened by "Buy Now") -->
        <div class="modal-overlay order-summary-overlay" id="order-summary-overlay">
            <div class="modal order-summary-modal" role="dialog" aria-modal="true" aria-labelledby="order-summary-title">
                <h3 id="order-summary-title">Order Summary</h3>

                <div class="order-section">
                    <h4>Customer Information</h4>
                    <p class="order-locked-note">These details come from your account and can't be edited here.</p>
                    <div class="order-field-row">
                        <div class="order-field locked">
                            <label for="order-name">Name:</label>
                            <input id="order-name" type="text" readonly tabindex="-1" autocomplete="off">
                        </div>
                        <div class="order-field locked">
                            <label for="order-contact">Contact Number:</label>
                            <input id="order-contact" type="tel" readonly tabindex="-1" autocomplete="off">
                        </div>
                    </div>
                    <div class="order-field-row">
                        <div class="order-field locked">
                            <label for="order-email">Email Address:</label>
                            <input id="order-email" type="email" readonly tabindex="-1" autocomplete="off">
                        </div>
                    </div>
                </div>

                <div class="order-section">
                    <h4>Delivery Information</h4>
                    <div class="delivery-box">
                        <span class="delivery-icon">${ICONS.bag}</span>
                        <div class="delivery-text">
                            <span class="delivery-label">Deliver to:</span>
                            <span class="delivery-location">${DELIVERY_LOCATION}</span>
                            <p class="delivery-note">${DELIVERY_NOTE}</p>
                        </div>
                    </div>
                </div>

                <div class="order-section">
                    <h4>Order Items</h4>
                    <div class="order-items-list" id="order-items-list"></div>
                </div>

                <div class="order-summary-bottom">
                    <div class="order-total-box">
                        <h4>Total</h4>
                        <div class="order-total-row muted">
                            <span>Subtotal</span><span id="order-subtotal">₱ 0.00</span>
                        </div>
                        <div class="order-total-row muted">
                            <span>Discount</span><span id="order-discount">– ₱ 0.00</span>
                        </div>
                        <div class="order-total-row highlight">
                            <span>Total</span><span id="order-total">₱ 0</span>
                        </div>
                    </div>

                    <div class="order-payment-box">
                        <h4>Payment Method</h4>
                        <div class="payment-options" id="payment-options">
                            ${PAYMENT_METHODS.map(m => `
                                <button type="button" class="payment-btn ${m.value === selectedPayment ? "active" : ""}" data-method="${m.value}">${m.label}</button>
                            `).join("")}
                        </div>
                        <p class="payment-note" id="payment-note"></p>
                    </div>
                </div>

                <button type="button" class="place-order-btn" id="place-order-btn">Place Order</button>
            </div>
        </div>
    `;

    renderProductImage(product.image_url);
    setupQuantitySelector();
    setupAddToCart();
    setupSortDropdown();
    setupReviewModal();
    setupOrderSummary();
}

function setupAddToCart() {
    const btn = document.getElementById("add-to-cart-btn");
    if (!btn) return;

    const originalHTML = btn.innerHTML;

    btn.addEventListener("click", async () => {
        if (btn.classList.contains("added") || btn.disabled) return;

        btn.disabled = true;
        const qty = getSelectedQuantity();
        const result = await addToCart(currentProduct.id, qty);
        btn.disabled = false;

        if (result === "logged-out") {
            window.location.href = getLoginUrl();
            return;
        }

        if (result === "error") {
            showError("We couldn't add this to your cart. Please try again.");
            return;
        }

        btn.classList.add("added");
        btn.innerHTML = `${ICONS.check} Added!`;

        setTimeout(() => {
            btn.classList.remove("added");
            btn.innerHTML = originalHTML;
        }, 1200);
    });
}

function renderProductImage(imageUrl) {
    const mainEl = document.getElementById("gallery-main-image");
    mainEl.innerHTML = imageUrl
        ? `<img src="${imageUrl}" alt="Product photo" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`
        : "";
}

function setupQuantitySelector() {
    const input = document.getElementById("qty-input");
    document.getElementById("qty-decrease").addEventListener("click", () => {
        input.value = Math.max(1, parseInt(input.value, 10) - 1);
    });
    document.getElementById("qty-increase").addEventListener("click", () => {
        input.value = parseInt(input.value, 10) + 1;
    });
}

function getSelectedQuantity() {
    const input = document.getElementById("qty-input");
    const qty = parseInt(input ? input.value : "1", 10);
    return Number.isNaN(qty) || qty < 1 ? 1 : qty;
}

function setupSortDropdown() {
    const dropdown = document.getElementById("sort-dropdown");
    const trigger = document.getElementById("sort-trigger");
    const menu = document.getElementById("sort-menu");

    trigger.addEventListener("click", e => {
        e.stopPropagation();
        dropdown.classList.toggle("open");
    });

    menu.querySelectorAll(".sort-option").forEach(option => {
        option.addEventListener("click", () => {
            currentSort = option.dataset.value;
            setSortDropdownValue(currentSort);
            dropdown.classList.remove("open");
            renderReviewsList();
        });
    });

    document.addEventListener("click", e => {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove("open");
        }
    });
}

function setSortDropdownValue(value) {
    const menu = document.getElementById("sort-menu");
    const label = document.getElementById("sort-trigger-label");
    if (!menu || !label) return;

    menu.querySelectorAll(".sort-option").forEach(option => {
        const isActive = option.dataset.value === value;
        option.classList.toggle("active", isActive);
        if (isActive) label.textContent = `Sort by: ${option.dataset.label}`;
    });
}

function renderReviewsSummary(reviews) {
    const total = reviews.length;
    const avg = total ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => counts[r.rating]++);

    const barsHtml = [5, 4, 3, 2, 1]
        .map(star => {
            const count = counts[star];
            const pct = total ? (count / total) * 100 : 0;
            return `
                <div class="rating-bar-row">
                    <span class="bar-label"><span class="bar-num">${star}</span><span class="bar-star">★</span></span>
                    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
                    <span class="bar-count">${count}</span>
                </div>
            `;
        })
        .join("");

    document.getElementById("rating-summary").innerHTML = `
        <div class="rating-average">${avg.toFixed(1)}<span class="rating-out-of">/5</span></div>
        <div class="rating-stars-large">${renderStars(avg)}</div>
        <div class="rating-total">${total} Review${total !== 1 ? "s" : ""}</div>
        <div class="rating-bars">${barsHtml}</div>
    `;

    document.getElementById("detail-rating-line").innerHTML = `
        <span class="detail-stars">${renderStars(avg)}</span>
        <span class="detail-rating-text">${avg.toFixed(1)} (${total} Review${total !== 1 ? "s" : ""})</span>
    `;
}

function getFilteredSortedReviews() {
    let list = [...allReviews];
    if (currentSort === "recent") {
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
        const starVal = parseInt(currentSort, 10);
        list = list.filter(r => r.rating === starVal);
    }
    return list;
}

function renderReviewsList() {
    const list = getFilteredSortedReviews();
    const listEl = document.getElementById("reviews-list");

    if (list.length === 0) {
        listEl.innerHTML = `<p class="no-reviews">No reviews yet for this rating.</p>`;
        return;
    }

    listEl.innerHTML = list
        .map(r => `
            <div class="review-card">
                <div class="review-header">
                    <div class="review-avatar" ${avatarStyle(r.reviewer_name, r.reviewer_avatar)}>
                        ${renderAvatar(r.reviewer_name, r.reviewer_avatar)}
                    </div>
                    <div class="review-meta">
                        <span class="review-name">${r.reviewer_name}</span>
                        <div class="review-stars">${renderStars(r.rating)}</div>
                    </div>
                    <span class="review-date">${formatDate(r.created_at)}</span>
                </div>
                <p class="review-comment">${truncateComment(r.comment)}</p>
            </div>
        `)
        .join("");
}

function refreshReviewsUI() {
    renderReviewsSummary(allReviews);
    renderReviewsList();
}

function setupReviewModal() {
    const overlay = document.getElementById("review-modal-overlay");
    const openBtn = document.getElementById("write-review-btn");
    const closeBtn = document.getElementById("modal-close-btn");
    const form = document.getElementById("review-form");
    const commentEl = document.getElementById("review-comment");
    const charCountEl = document.getElementById("char-count-val");
    const starInput = document.getElementById("star-input");
    const reviewingAsEl = document.getElementById("reviewing-as");

    function openModal(user) {
        activeUser = user;
        selectedRating = 0;
        form.reset();
        charCountEl.textContent = "0";
        updateStarInputDisplay();

        reviewingAsEl.innerHTML = `
            <div class="review-avatar" ${avatarStyle(user.name, user.avatar_url)}>
                ${renderAvatar(user.name, user.avatar_url)}
            </div>
            <span class="reviewing-as-name">${user.name}</span>
        `;

        overlay.classList.add("open");
    }

    function closeModal() {
        overlay.classList.remove("open");
    }

    function updateStarInputDisplay() {
        starInput.querySelectorAll(".star-choice").forEach(star => {
            star.classList.toggle("selected", parseInt(star.dataset.value, 10) <= selectedRating);
        });
    }

    openBtn.addEventListener("click", async () => {
        const user = await getCurrentUser();
        if (!user) {
            window.location.href = getLoginUrl();
            return;
        }
        openModal(user);
    });

    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", e => {
        if (e.target === overlay) closeModal();
    });

    starInput.querySelectorAll(".star-choice").forEach(star => {
        star.addEventListener("click", () => {
            selectedRating = parseInt(star.dataset.value, 10);
            updateStarInputDisplay();
        });
    });

    commentEl.addEventListener("input", () => {
        charCountEl.textContent = commentEl.value.length;
    });

    form.addEventListener("submit", async e => {
        e.preventDefault();

        if (selectedRating === 0) {
            showWarning("Please select a star rating.");
            return;
        }

        const comment = commentEl.value.trim();
        if (!comment || !activeUser) return;

        const saved = await submitReview({
            reviewer_id: activeUser.id,
            reviewer_name: activeUser.name,
            reviewer_avatar: activeUser.avatar_url,
            rating: selectedRating,
            comment: comment
        });

        if (!saved) return;

        allReviews.unshift(saved);
        currentSort = "recent";
        setSortDropdownValue("recent");
        refreshReviewsUI();
        closeModal();
        showToast("Thanks for your review!");
    });
}

function setupOrderSummary() {
    const overlay = document.getElementById("order-summary-overlay");
    const buyNowBtn = document.getElementById("buy-now-btn");
    const paymentOptions = document.getElementById("payment-options");
    const placeOrderBtn = document.getElementById("place-order-btn");

    buyNowBtn.addEventListener("click", async () => {
        if (buyNowBtn.disabled) return;

        // Must be logged in to check out
        buyNowBtn.disabled = true;
        const user = await getCurrentUser();
        buyNowBtn.disabled = false;

        if (!user) {
            await promptLoginRequired();
            return;
        }

        const qty = getSelectedQuantity();

        const items = [{
            id: currentProduct.id,
            name: currentProduct.name,
            price: currentProduct.price,
            qty: qty,
            image_url: currentProduct.image_url || null
        }];

        if (DEMO_MANY_ORDER_ITEMS) {
            for (let i = 2; i <= 7; i++) {
                items.push({ id: 100 + i, name: `Sample Product ${i}`, price: 150, qty: 1, image_url: null });
            }
        }

        openOrderSummary(items, user);
    });

    paymentOptions.addEventListener("click", e => {
        const btn = e.target.closest(".payment-btn");
        if (!btn) return;
        selectedPayment = btn.dataset.method;
        setPaymentMethod(selectedPayment);
    });

    placeOrderBtn.addEventListener("click", handlePlaceOrder);

    overlay.addEventListener("click", e => {
        if (e.target === overlay) closeOrderSummary();
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && overlay.classList.contains("open")) closeOrderSummary();
    });
}

function openOrderSummary(items, user) {
    const overlay = document.getElementById("order-summary-overlay");
    orderItems = items;

    // Customer Information is filled from the account and locked (read-only)
    document.getElementById("order-name").value = user.name || "";
    document.getElementById("order-contact").value = user.contact_number || "";
    document.getElementById("order-email").value = user.email || "";

    renderOrderItems();
    renderOrderTotals();
    setPaymentMethod(selectedPayment);

    overlay.classList.add("open");
    overlay.scrollTop = 0;
    lockPageScroll();
}

function closeOrderSummary() {
    document.getElementById("order-summary-overlay").classList.remove("open");
    unlockPageScroll();
}

function renderOrderItems() {
    const listEl = document.getElementById("order-items-list");

    listEl.innerHTML = orderItems
        .map(item => `
            <div class="order-item-row">
                <div class="order-item-thumb">
                    ${item.image_url ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}">` : ""}
                </div>
                <div class="order-item-info">
                    <span class="order-item-name">${escapeHtml(item.name)}</span>
                    <span class="order-item-qty">x${item.qty}</span>
                </div>
                <span class="order-item-price">${peso(item.price * item.qty, false)}</span>
            </div>
        `)
        .join("");

    listEl.scrollTop = 0;
}

function renderOrderTotals() {
    const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    const discount = 0;
    const total = subtotal - discount;

    document.getElementById("order-subtotal").textContent = peso(subtotal);
    document.getElementById("order-discount").textContent = "– " + peso(discount);
    document.getElementById("order-total").textContent = peso(total, total % 1 !== 0);
}

function setPaymentMethod(value) {
    selectedPayment = value;

    document.querySelectorAll("#payment-options .payment-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.method === value);
    });

    const method = PAYMENT_METHODS.find(m => m.value === value);
    document.getElementById("payment-note").textContent = method ? method.note : "";
}

/* ---------------------------------------------------------
   PLACE ORDER — now wired to real Supabase inserts (PaymentFlow.js)
   plus the PayMongo e-wallet flow for online payments.

   Customer details are taken from the logged-in profile, NOT from
   the (locked) input boxes, so they can't be changed from the page.
--------------------------------------------------------- */
async function handlePlaceOrder() {
    if (orderItems.length === 0) return;

    // Re-check the login right now (the session may have expired)
    const user = await getCurrentUser();
    if (!user) {
        closeOrderSummary();
        await promptLoginRequired();
        return;
    }

    if (!user.name || !user.contact_number || !user.email) {
        showWarning("Your account is missing some details (name, contact number, or email). Please contact us so we can fix your account.");
        return;
    }

    const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    const discount = 0;
    const total = subtotal - discount;

    // createRealOrder() lives in PaymentFlow.js — inserts into the real
    // "orders" + "order_items" tables, matching the actual Supabase schema.
    const createdOrder = await createRealOrder({
        user_id: user.id,
        total: total,
        payment_method: selectedPayment,
        items: orderItems
    });

    if (!createdOrder) return; // createRealOrder() already showed an error popup

    if (selectedPayment === "ewallet") {
        // processEwalletPayment() also lives in PaymentFlow.js — calls the
        // Node backend for a PayMongo QR Ph code, shows it, and polls this
        // order's status until it's marked paid (or the user cancels).
        const paid = await processEwalletPayment(createdOrder.id, total);
        if (!paid) {
            closeOrderSummary();
            return;
        }
    }

    closeOrderSummary();
    await showSuccess(
        "We'll message you once it's ready for pick-up at UCC Congress.",
        "Order placed!"
    );
}

async function init() {
    currentProduct = await getProduct();

    if (!currentProduct) {
        document.getElementById("product-detail").innerHTML =
            `<p style="padding:60px 40px;">Sorry, we couldn't find that product.</p>`;
        return;
    }

    renderProductDetail(currentProduct);

    allReviews = await getReviews();
    refreshReviewsUI();
}

init();