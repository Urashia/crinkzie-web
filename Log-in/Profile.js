/* ============================================================
   PROFILE PAGE — dynamic via Supabase
   ------------------------------------------------------------
   Schema (from your ERD + new tables):
   - profiles:   id (fk auth.users), full_name, student_id,
                 year_section, email, phone, address, school
   - products:   id, name, price, image_url, ...
   - orders:     id, user_id, status ('pending','paid' => CURRENT |
                 'completed' => HISTORY), payment_reference,
                 total_amount, created_at
   - order_items: order_id, product_id, product_name, quantity, price

   STATUS SYSTEM (matches the admin Orders.js exactly):
   - pending   — cash order, not yet paid
   - paid      — payment confirmed (e-wallet auto, or cash confirmed
                 by an admin), waiting for pickup
   - completed — picked up, done

   There's no "processing", "for_pickup", "delivered", or
   "cancelled" — orders can't be cancelled once placed (products
   are made fresh to order), and pickup is always on-campus, so
   those in-between states didn't add anything useful.
   ============================================================ */

const CURRENT_STATUSES = ['pending', 'paid'];
const HISTORY_STATUSES = ['completed'];

let ordersCache = [];
let profileCache = null;

/* ---------- helpers ---------- */

function getInitials(name) {
    if (!name) return '--';
    return name.trim().split(/\s+/)
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

function formatPeso(amount) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(amount);
}

function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    }) + ' · ' + d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit'
    });
}

function statusLabel(status) {
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
}

function orderNumber(id) {
    return 'ORD - ' + String(id).padStart(4, '0');
}

/* ---------- profile ---------- */

async function loadProfile(session) {
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error || !profile) {
        console.error('Failed to load profile:', error);
        return;
    }

    profileCache = profile;

    document.getElementById('p-name').textContent = profile.full_name || '';
    document.getElementById('p-initials').textContent = getInitials(profile.full_name);
    document.getElementById('p-student-id').textContent = profile.student_id || '';
    document.getElementById('p-year-section').textContent = profile.year_section || '';
    document.getElementById('p-email').textContent = profile.email || session.user.email || '';
    document.getElementById('p-phone').textContent = profile.phone || '';
    document.getElementById('p-address').textContent = profile.address || '';
    document.getElementById('p-school').textContent = profile.school || '';
}

/* ---------- orders ---------- */

async function loadOrders(userId) {
    const { data: orders, error } = await supabaseClient
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load orders:', error);
        return;
    }

    ordersCache = orders || [];
    renderOrderList('current-orders', ordersCache.filter(o => CURRENT_STATUSES.includes(o.status)));
    renderOrderList('order-history', ordersCache.filter(o => HISTORY_STATUSES.includes(o.status)));
}

function orderDisplayName(order) {
    const items = order.order_items || [];
    if (items.length === 0) return orderNumber(order.id);
    if (items.length === 1) return items[0].product_name;
    return `${items[0].product_name} +${items.length - 1} more`;
}

/* NOTE: product thumbnails are NOT stored on order_items.
   If you want real images here later, join products:
   .select('*, order_items(*, products(name, image_url))')
   For now we show the placeholder box from the Figma design. */

function renderOrderList(containerId, orders) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (orders.length === 0) {
        container.innerHTML = '<p class="orders-empty">No orders yet.</p>';
        return;
    }

    orders.forEach(order => {
        const row = document.createElement('div');
        row.className = 'order-row';

        row.innerHTML = `
            <div class="order-thumb placeholder"><i class="fa-solid fa-cookie-bite"></i></div>
            <span class="order-name">${orderDisplayName(order)}</span>
            <button type="button" class="view-receipt-btn" data-order-id="${order.id}">View Receipt</button>
        `;
        container.appendChild(row);
    });
}

/* ---------- modal ---------- */

function openReceiptModal(orderId) {
    const order = ordersCache.find(o => String(o.id) === String(orderId));
    if (!order) return;

    document.getElementById('m-order-id').textContent = orderNumber(order.id);
    document.getElementById('m-date').textContent = formatDateTime(order.created_at);
    document.getElementById('m-status').textContent = statusLabel(order.status);

    // customer info comes from the already-loaded profile
    if (profileCache) {
        document.getElementById('m-name').textContent = profileCache.full_name || '';
        document.getElementById('m-student-id').textContent = profileCache.student_id || '';
        document.getElementById('m-year-section').textContent = profileCache.year_section || '';
    }

    // items
    const itemsContainer = document.getElementById('m-items');
    itemsContainer.innerHTML = '';
    let computedTotal = 0;
    (order.order_items || []).forEach(item => {
        const lineTotal = Number(item.quantity) * Number(item.price);
        computedTotal += lineTotal;
        const row = document.createElement('div');
        row.className = 'items-row';
        row.innerHTML = `
            <span>${item.product_name}</span>
            <span>${item.quantity}</span>
            <span>${formatPeso(item.price)}</span>
            <span>${formatPeso(lineTotal)}</span>
        `;
        itemsContainer.appendChild(row);
    });

    const total = order.total_amount != null ? Number(order.total_amount) : computedTotal;
    document.getElementById('m-total').textContent = formatPeso(total);

    document.getElementById('m-payment-ref').textContent = order.payment_reference || 'N/A';

    const overlay = document.getElementById('receipt-modal');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeReceiptModal() {
    const overlay = document.getElementById('receipt-modal');
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

/* ---------- init ---------- */

async function initProfilePage() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = 'Account.html';
        return;
    }

    await loadProfile(session);
    await loadOrders(session.user.id);

    // event delegation for View Receipt buttons
    document.querySelectorAll('.orders-list').forEach(list => {
        list.addEventListener('click', e => {
            const btn = e.target.closest('.view-receipt-btn');
            if (btn) openReceiptModal(btn.dataset.orderId);
        });
    });

    document.getElementById('modal-close').addEventListener('click', closeReceiptModal);

    // click on dark blurred backdrop closes the modal
    document.getElementById('receipt-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeReceiptModal();
    });

    // Esc closes the modal
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeReceiptModal();
    });
}

document.getElementById('sign-out-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'Account.html';
});

initProfilePage();