/* =========================================================
   Cart.js
   -----------------------------------------------------------
   STATUS: LIVE — reads and writes the real "cart_items" table,
   and creates real "orders"/"order_items" rows via
   PaymentFlow.js (createRealOrder, processEwalletPayment).

   getCurrentUser() is duplicated from ProductDetail.js so this
   page works standalone. createRealOrder()/processEwalletPayment()
   live in the shared PaymentFlow.js instead, loaded via a
   <script> tag in Cart.html before this file.

   Requires SweetAlert2 + alerts.js to be loaded before this file.

   CHECKOUT RULES
     - Logged-out visitors who press "Proceed to Checkout" are asked
       to log in or create an account first (requireLogin in alerts.js).
     - Name / contact number / email in the Order Summary come from the
       account and are read-only.

   REAL TABLE SHAPES (confirmed against Supabase)
     orders       id, user_id, status, payment_reference, total_amount, created_at
     order_items  id, order_id, product_id, product_name, quantity, price
--------------------------------------------------------- */

const LOGIN_PAGE_PATH = "../Log-in/Account.html";
const SIGNUP_PAGE_PATH = "../Log-in/Creation.html";
const PROFILE_PAGE_PATH = "../Log-in/Profile.html";

const DELIVERY_LOCATION = "UCC Congress (Campus)";
const PAYMENT_METHODS = [
    { value: "pickup", label: "Cash", note: "Please prepare the exact amount. Pay when you claim your order at UCC Congress." },
    { value: "ewallet", label: "E-wallet", note: "Please note that you will be redirected to PayMongo" }
];

const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;

let cartItems = [];
let selectedPayment = "pickup";
let orderItems = [];

// Guard against duplicate orders: true while an order is being created / paid,
// so extra clicks on "Place Order" are ignored.
let isPlacingOrder = false;

async function getCartItems() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return [];

    const { data, error } = await supabaseClient
        .from('cart_items')
        .select('id, quantity, products (id, name, price, image_url)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load cart:', error);
        return [];
    }

    return data
        .filter(row => row.products)
        .map(row => ({
            id: row.id,
            product_id: row.products.id,
            name: row.products.name,
            price: row.products.price,
            qty: row.quantity,
            image_url: row.products.image_url,
            selected: true
        }));
}

async function updateCartItemQuantity(cartItemId, quantity) {
    const { error } = await supabaseClient
        .from('cart_items')
        .update({ quantity })
        .eq('id', cartItemId);

    if (error) console.error('Failed to update quantity:', error);
}

async function deleteCartItem(cartItemId) {
    const { error } = await supabaseClient
        .from('cart_items')
        .delete()
        .eq('id', cartItemId);

    if (error) console.error('Failed to remove cart item:', error);
}

async function isLoggedIn() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return !!session;
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
        contact_number: profile.phone,
        email: profile.email
    };
}

// A profile is "complete" when the three locked checkout fields are usable.
function profileIsComplete(user) {
    return !!(user.name && user.contact_number && user.email && /^\S+@\S+\.\S+$/.test(user.email));
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

function renderCartItems() {
    const listEl = document.getElementById("cart-items-list");

    if (cartItems.length === 0) {
        listEl.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
        return;
    }

    listEl.innerHTML = cartItems.map(renderCartItemRow).join("");
}

function renderCartItemRow(item) {
    const totalPrice = item.price * item.qty;

    return `
        <div class="cart-item" data-id="${item.id}">
            <div class="cart-item-card">
                <button type="button" class="cart-checkbox ${item.selected ? "checked" : ""}" data-action="toggle" aria-label="${item.selected ? "Deselect item" : "Select item"}"></button>

                <button type="button" class="cart-item-delete" data-action="delete" aria-label="Remove item">
                    ${TRASH_ICON}
                </button>

                <div class="cart-item-thumb">
                    ${item.image_url ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}">` : ""}
                </div>

                <div class="cart-item-info">
                    <p class="cart-item-name">${escapeHtml(item.name)}</p>
                    <div class="cart-item-divider"></div>
                    <p class="cart-item-unit-price">${peso(item.price)}</p>

                    <div class="cart-item-footer">
                        <div class="quantity-selector">
                            <button type="button" class="qty-decrease" data-action="decrease">−</button>
                            <input type="text" class="qty-input" value="${item.qty}" readonly>
                            <button type="button" class="qty-increase" data-action="increase">+</button>
                        </div>
                        <p class="cart-item-total">Total Price: <span>${peso(totalPrice, false)}</span></p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateItemsSelectedCount() {
    const count = cartItems.filter(i => i.selected).length;
    document.getElementById("items-selected-text").textContent = `Items Selected: ${count}`;
}

function setupCartListEvents() {
    const listEl = document.getElementById("cart-items-list");

    listEl.addEventListener("click", async e => {
        const row = e.target.closest(".cart-item");
        if (!row) return;

        const action = e.target.closest("[data-action]")?.dataset.action;
        if (!action) return;

        const id = parseInt(row.dataset.id, 10);
        const item = cartItems.find(i => i.id === id);
        if (!item) return;

        if (action === "toggle") {
            item.selected = !item.selected;
            renderCartItems();
            updateItemsSelectedCount();
        }

        if (action === "increase") {
            item.qty += 1;
            renderCartItems();
            await updateCartItemQuantity(item.id, item.qty);
        }

        if (action === "decrease") {
            item.qty = Math.max(1, item.qty - 1);
            renderCartItems();
            await updateCartItemQuantity(item.id, item.qty);
        }

        if (action === "delete") {
            cartItems = cartItems.filter(i => i.id !== id);
            renderCartItems();
            updateItemsSelectedCount();
            await deleteCartItem(id);
        }
    });
}

function getSelectedItems() {
    return cartItems.filter(i => i.selected);
}

function setupCartActions() {
    document.getElementById("continue-shopping-btn").addEventListener("click", () => {
        window.location.href = "../Shop/Shop.html";
    });

    document.getElementById("checkout-btn").addEventListener("click", async () => {
        // Logged-out visitors must log in or sign up before checking out.
        if (!(await isLoggedIn())) {
            await requireLogin(
                LOGIN_PAGE_PATH,
                SIGNUP_PAGE_PATH,
                "Please log in or create an account to check out."
            );
            return;
        }

        const selected = getSelectedItems();
        if (selected.length === 0) {
            showWarning("Please select at least one item to checkout.");
            return;
        }

        const user = await getCurrentUser();
        if (!user) {
            showError("We couldn't load your account details. Please refresh the page and try again.");
            return;
        }

        openOrderSummary(selected, user);
    });
}

function setupOrderSummary() {
    const overlay = document.getElementById("order-summary-overlay");
    const paymentOptions = document.getElementById("payment-options");
    const placeOrderBtn = document.getElementById("place-order-btn");

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

// Makes Name / Contact Number / Email read-only and adds a small hint under
// the "Customer Information" heading (once). Cart.html doesn't need editing.
function lockCustomerFields() {
    ["order-name", "order-contact", "order-email"].forEach(id => {
        document.getElementById(id).readOnly = true;
    });

    const heading = document.querySelector("#order-summary-overlay .order-section h4");
    if (heading && !document.getElementById("order-info-note")) {
        heading.insertAdjacentHTML(
            "afterend",
            `<p class="order-info-note" id="order-info-note">Filled in from your account. To change these, update your profile.</p>`
        );
    }
}

async function openOrderSummary(items, user) {
    const overlay = document.getElementById("order-summary-overlay");
    orderItems = items;

    // These three fields are read-only: they always come from the account.
    lockCustomerFields();
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

// Locks / unlocks the Place Order button while an order is in progress.
function setPlaceOrderBusy(busy) {
    const btn = document.getElementById("place-order-btn");
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? "Processing..." : "Place Order";
}

/* ---------------------------------------------------------
   PLACE ORDER — real Supabase inserts (PaymentFlow.js) plus the
   PayMongo e-wallet flow for online payments. On success, the
   checked-out items are removed from cart_items for real.

   Duplicate protection:
     1. isPlacingOrder blocks extra clicks while we're working.
     2. The button is disabled and shows "Processing...".
     3. If the e-wallet payment is cancelled, expires, or fails, the unpaid
        order is deleted (see processEwalletPayment in PaymentFlow.js) and the
        Order Summary stays open so the customer can pick e-wallet or cash.
--------------------------------------------------------- */
async function handlePlaceOrder() {
    // Ignore any click that happens while an order is already in progress.
    if (isPlacingOrder) return;
    if (orderItems.length === 0) return;

    // Lock immediately — before any await — so a fast double-click can't slip through.
    isPlacingOrder = true;
    setPlaceOrderBusy(true);

    try {
        // Re-check the session in case it expired while the modal was open.
        if (!(await isLoggedIn())) {
            await requireLogin(
                LOGIN_PAGE_PATH,
                SIGNUP_PAGE_PATH,
                "Your session has ended. Please log in again to place your order."
            );
            return;
        }

        // Use the saved account details, not the on-screen fields, so they
        // can't be changed from the browser.
        const user = await getCurrentUser();
        if (!user) {
            showError("We couldn't load your account details. Please refresh the page and try again.");
            return;
        }
        if (!profileIsComplete(user)) {
            await requireProfile(PROFILE_PAGE_PATH);
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
            // processEwalletPayment() also lives in PaymentFlow.js.
            const paid = await processEwalletPayment(createdOrder.id, total);
            if (!paid) {
                // processEwalletPayment() already deleted the unpaid order.
                // Keep the Order Summary open so the customer can choose
                // e-wallet or cash again.
                return;
            }
        }

        // Remove the items that were just checked out from the cart itself —
        // both on screen and for real, in Supabase.
        const checkedOutIds = orderItems.map(i => i.id);
        cartItems = cartItems.filter(i => !checkedOutIds.includes(i.id));
        renderCartItems();
        updateItemsSelectedCount();

        await Promise.all(checkedOutIds.map(id => deleteCartItem(id)));

        closeOrderSummary();
        await showSuccess(
            "We'll message you once it's ready for pick-up at UCC Congress.",
            "Order placed!"
        );
    } finally {
        // Always unlock, whatever happened above.
        isPlacingOrder = false;
        setPlaceOrderBusy(false);
    }
}

async function init() {
    // Wake the (free-tier) payment server now, so the QR code is fast later.
    wakePaymentBackend();

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        document.getElementById("cart-items-list").innerHTML =
            `<p class="cart-empty">Please <a href="${LOGIN_PAGE_PATH}">log in</a> to view your cart.</p>`;
        setupCartActions();
        return;
    }

    cartItems = await getCartItems();
    renderCartItems();
    updateItemsSelectedCount();

    setupCartListEvents();
    setupCartActions();
    setupOrderSummary();
}

init();