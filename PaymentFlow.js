/* =========================================================
   PaymentFlow.js
   -----------------------------------------------------------
   Shared by ProductDetail.js and Cart.js. Handles:
     1. Creating the real "orders" + "order_items" rows
        (matches the actual Supabase schema — NOT the older
        customer_id/subtotal/unit_price shape from old comments)
     2. For "ewallet" orders: calling the Node backend to get a
        PayMongo QR Ph code, showing it in a modal, and polling
        the order's status until it flips to "paid" (or the
        code expires / the user cancels)
     3. For "pickup" (cash) orders: nothing extra — they're just
        left as "pending" until an admin marks them Paid/Completed
--------------------------------------------------------- */

// Your local Node backend for now. Swap this to your deployed
// server's URL once you host it (see the "Deploy" step later).
const PAYMENT_BACKEND_URL = "https://crinkzie.onrender.com";

// How often to check whether the QR code has been paid (ms).
const PAYMENT_POLL_INTERVAL = 3000;
// PayMongo QR Ph codes expire after 30 minutes — stop polling after that.
const PAYMENT_POLL_TIMEOUT = 30 * 60 * 1000;

/* ---------------------------------------------------------
   1. CREATE THE REAL ORDER
   order = { user_id, total, payment_method, items: [{id, name, price, qty}] }
   Returns the created order row (with its real numeric id), or null on failure.
--------------------------------------------------------- */
async function createRealOrder(order) {
    const { data: createdOrder, error: orderError } = await supabaseClient
        .from('orders')
        .insert([{
            user_id: order.user_id,
            status: 'pending',
            total_amount: order.total
        }])
        .select()
        .single();

    if (orderError || !createdOrder) {
        console.error('Failed to create order:', orderError);
        alert("Sorry, we couldn't place your order. Please try again.");
        return null;
    }

    const itemRows = order.items.map(item => ({
        order_id: createdOrder.id,
        product_id: item.id,
        product_name: item.name,
        quantity: item.qty,
        price: item.price
    }));

    const { error: itemsError } = await supabaseClient
        .from('order_items')
        .insert(itemRows);

    if (itemsError) {
        console.error('Failed to save order items:', itemsError);
        alert("Your order was started but some items failed to save. Please contact support.");
        return null;
    }

    return createdOrder;
}

/* ---------------------------------------------------------
   2. E-WALLET FLOW: get QR from backend, show it, poll for payment
   Returns true once payment is confirmed, false if the user cancels
   or the code expires without paying.
--------------------------------------------------------- */
async function processEwalletPayment(orderId, amount) {
    injectPaymentModalOnce();

    let response;
    try {
        response = await fetch(`${PAYMENT_BACKEND_URL}/create-payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, amount })
        });
    } catch (err) {
        console.error('Could not reach payment server:', err);
        alert("We couldn't connect to the payment service. Please check your connection and try again.");
        return false;
    }

    const data = await response.json();
    if (!response.ok || !data.qrImageUrl) {
        console.error('Payment creation failed:', data);
        alert("Sorry, we couldn't generate a payment QR code. Please try again.");
        return false;
    }

    return showPaymentModalAndPoll(orderId, data.qrImageUrl);
}

function showPaymentModalAndPoll(orderId, qrImageUrl) {
    const overlay = document.getElementById('payment-qr-overlay');
    const img = document.getElementById('payment-qr-image');
    const statusText = document.getElementById('payment-qr-status');
    const cancelBtn = document.getElementById('payment-qr-cancel');

    img.src = qrImageUrl;
    statusText.textContent = 'Waiting for payment...';
    overlay.classList.add('open');

    return new Promise(resolve => {
        let cancelled = false;
        const startTime = Date.now();

        const pollTimer = setInterval(async () => {
            if (Date.now() - startTime > PAYMENT_POLL_TIMEOUT) {
                clearInterval(pollTimer);
                statusText.textContent = 'This QR code has expired.';
                setTimeout(() => {
                    overlay.classList.remove('open');
                    resolve(false);
                }, 2000);
                return;
            }

            const { data, error } = await supabaseClient
                .from('orders')
                .select('status')
                .eq('id', orderId)
                .single();

            if (error) {
                console.error('Error checking payment status:', error);
                return;
            }

            if (data.status === 'paid' || data.status === 'completed') {
                clearInterval(pollTimer);
                statusText.textContent = 'Payment received!';
                setTimeout(() => {
                    overlay.classList.remove('open');
                    resolve(true);
                }, 1200);
            }
        }, PAYMENT_POLL_INTERVAL);

        cancelBtn.onclick = () => {
            if (cancelled) return;
            cancelled = true;
            clearInterval(pollTimer);
            overlay.classList.remove('open');
            resolve(false);
        };
    });
}

/* ---------------------------------------------------------
   Modal markup is injected via JS (once) so neither ProductDetail.html
   nor Cart.html need to be edited by hand.
--------------------------------------------------------- */
function injectPaymentModalOnce() {
    if (document.getElementById('payment-qr-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'payment-qr-overlay';
    overlay.style.cssText = `
        display:none; position:fixed; inset:0; background:rgba(33,15,4,0.55);
        align-items:center; justify-content:center; z-index:3000; padding:20px;
    `;
    overlay.innerHTML = `
        <div style="background:var(--white,#fff); border-radius:10px; padding:32px;
                    max-width:360px; width:100%; text-align:center;
                    font-family:'Quicksand', var(--font);">
            <h3 style="margin-bottom:16px;">Scan to Pay</h3>
            <img id="payment-qr-image" alt="PayMongo QR Ph code"
                 style="width:100%; max-width:260px; border-radius:8px; margin-bottom:16px;">
            <p id="payment-qr-status" style="margin-bottom:20px; font-weight:600;"></p>
            <button id="payment-qr-cancel" type="button" style="
                padding:10px 20px; border:1.5px solid var(--brown,#210F04); background:transparent;
                border-radius:8px; font-family:inherit; font-weight:700; cursor:pointer;">
                Cancel
            </button>
        </div>
    `;
    document.body.appendChild(overlay);

    // Simple show/hide toggle via a class, matching the .open pattern
    // your other modals already use.
    const style = document.createElement('style');
    style.textContent = `#payment-qr-overlay.open { display: flex !important; }`;
    document.head.appendChild(style);
}