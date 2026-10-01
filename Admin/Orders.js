// --- ADMIN AUTH GUARD (same pattern as Customers.js) ---
(async function enforceAdminAccess() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = 'Admin-login.html';
        return;
    }

    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

    if (error || !profile || !profile.is_admin) {
        alert('Access Denied: You do not have admin permissions.');
        await supabaseClient.auth.signOut();
        window.location.href = 'Admin-login.html';
    }
})();
// ------------------------

const tableBody = document.getElementById('orders-table-body');
const searchInput = document.getElementById('order-search');
const paginationEl = document.getElementById('pagination');
const modalOverlay = document.getElementById('order-modal-overlay');
const closeModalBtn = document.getElementById('close-modal-btn');
const markPaidBtn = document.getElementById('mark-paid-btn');
const logoutBtn = document.getElementById('logout-btn');

const PAGE_SIZE = 10;

let allOrders = [];       // orders + merged customer info
let currentPage = 1;
let searchTerm = '';
let activeOrder = null;   // the order currently open in the detail modal

/* ---------------------------------------------------------
   FORMATTING HELPERS
--------------------------------------------------------- */
function formatOrderId(id) {
    return `ORD - ${String(id).padStart(4, '0')}`;
}

function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${datePart} \u2022 ${timePart}`;
}

function peso(amount) {
    return '\u20B1' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Normalizes whatever is in the status column to one of the three
// statuses the whole app uses: pending, paid, completed.
// Anything unrecognized falls back to "pending" so it isn't silently
// mislabeled as done.
function normalizeStatus(status) {
    const s = (status || '').toLowerCase();
    return ['pending', 'paid', 'completed'].includes(s) ? s : 'pending';
}

const STATUS_LABELS = { pending: 'Pending', paid: 'Paid', completed: 'Completed' };

// What clicking the "progress" button/badge should move an order to next.
// Completed has no next step — it's the end of the line.
const NEXT_STATUS = { pending: 'paid', paid: 'completed', completed: null };
const NEXT_STATUS_LABEL = { pending: 'Mark as Paid', paid: 'Mark as Completed' };

function statusBadge(status) {
    const normalized = normalizeStatus(status);
    return `<span class="status-badge status-${normalized}">${STATUS_LABELS[normalized]}</span>`;
}

/* ---------------------------------------------------------
   DATA FETCHING
   Two separate queries (orders, then profiles / order_items)
   merged client-side, rather than relying on Supabase's
   auto-embedding, since user_id -> profiles.id isn't a
   declared foreign key.
--------------------------------------------------------- */
async function loadOrders() {
    // order_items has a real FK to orders, so this embeds cleanly
    // (same pattern already proven working in Profile.js).
    const { data: orders, error: ordersError } = await supabaseClient
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

    if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        return [];
    }

    const userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))];
    let profilesById = {};

    if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseClient
            .from('profiles')
            .select('id, full_name, student_id, year_section')
            .in('id', userIds);

        if (profilesError) {
            console.error('Error fetching profiles for orders:', profilesError);
        } else {
            profilesById = Object.fromEntries(profiles.map(p => [p.id, p]));
        }
    }

    return orders.map(order => ({
        ...order,
        customer: profilesById[order.user_id] || null
    }));
}

async function updateOrderStatus(orderId, status) {
    const { error } = await supabaseClient
        .from('orders')
        .update({ status })
        .eq('id', orderId);

    if (error) {
        console.error('Error updating order status:', error);
        alert('Failed to update order status.');
        return false;
    }
    return true;
}

/* ---------------------------------------------------------
   TABLE + PAGINATION
--------------------------------------------------------- */
function getFilteredOrders() {
    if (!searchTerm.trim()) return allOrders;

    const term = searchTerm.trim().toLowerCase();
    return allOrders.filter(order =>
        formatOrderId(order.id).toLowerCase().includes(term) ||
        String(order.id).includes(term)
    );
}

function renderTable() {
    const filtered = getFilteredOrders();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageOrders = filtered.slice(start, start + PAGE_SIZE);

    if (pageOrders.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No orders found.</td></tr>';
    } else {
        tableBody.innerHTML = pageOrders.map(order => `
            <tr>
                <td>${formatOrderId(order.id)}</td>
                <td>${order.customer ? order.customer.full_name : '\u2014'}</td>
                <td>${formatDateTime(order.created_at)}</td>
                <td>${statusBadge(order.status)}</td>
                <td>
                    <button class="action-btn view-btn" data-id="${order.id}" aria-label="View order">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    tableBody.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => openOrderDetail(btn.dataset.id));
    });

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    let dots = '';
    for (let i = 1; i <= totalPages; i++) {
        dots += `<button class="page-dot ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    paginationEl.innerHTML = `
        <button class="page-arrow" id="page-prev" aria-label="Previous page">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle><path d="M15 8l-4 4 4 4"></path>
            </svg>
        </button>
        <div class="page-dots">${dots}</div>
        <button class="page-arrow" id="page-next" aria-label="Next page">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle><path d="M9 8l4 4-4 4"></path>
            </svg>
        </button>
    `;

    document.getElementById('page-prev').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderTable(); }
    });
    document.getElementById('page-next').addEventListener('click', () => {
        if (currentPage < totalPages) { currentPage++; renderTable(); }
    });
    paginationEl.querySelectorAll('.page-dot').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page, 10);
            renderTable();
        });
    });
}

/* ---------------------------------------------------------
   ORDER DETAIL MODAL
--------------------------------------------------------- */
async function openOrderDetail(orderId) {
    const order = allOrders.find(o => String(o.id) === String(orderId));
    if (!order) return;

    activeOrder = order;
    const items = order.order_items || [];
    const normalized = normalizeStatus(order.status);

    document.getElementById('od-order-id').textContent = formatOrderId(order.id);
    document.getElementById('od-date').textContent = formatDateTime(order.created_at);
    document.getElementById('od-status').innerHTML = statusBadge(order.status);

    document.getElementById('od-name').textContent = order.customer ? order.customer.full_name : '\u2014';
    document.getElementById('od-student-id').textContent = order.customer ? order.customer.student_id || '\u2014' : '\u2014';
    document.getElementById('od-year-section').textContent = order.customer ? order.customer.year_section || '\u2014' : '\u2014';

    document.getElementById('od-items-body').innerHTML = items.map(item => `
        <tr>
            <td>${item.product_name}</td>
            <td>${item.quantity}</td>
            <td>${peso(item.price)}</td>
            <td>${peso(item.price * item.quantity)}</td>
        </tr>
    `).join('');

    document.getElementById('od-total-amount').textContent = peso(order.total_amount);

    // No payment_method column exists yet — inferred from whether a
    // payment_reference is present (set by PayMongo for e-wallet orders).
    if (order.payment_reference) {
        document.getElementById('od-payment-label').textContent = 'PayMongo Reference';
        document.getElementById('od-payment-value').textContent = order.payment_reference;
    } else {
        document.getElementById('od-payment-label').textContent = 'Payment Method';
        document.getElementById('od-payment-value').textContent = 'Cash (on pickup)';
    }

    const next = NEXT_STATUS[normalized];
    if (next) {
        markPaidBtn.style.display = 'inline-flex';
        markPaidBtn.textContent = NEXT_STATUS_LABEL[normalized];
        markPaidBtn.dataset.nextStatus = next;
    } else {
        markPaidBtn.style.display = 'none';
    }

    modalOverlay.classList.add('open');
}

function closeOrderDetail() {
    modalOverlay.classList.remove('open');
    activeOrder = null;
}

closeModalBtn.addEventListener('click', closeOrderDetail);
modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeOrderDetail();
});

markPaidBtn.addEventListener('click', async () => {
    if (!activeOrder) return;
    const next = markPaidBtn.dataset.nextStatus;
    if (!next) return;

    if (!confirm(`Mark ${formatOrderId(activeOrder.id)} as ${STATUS_LABELS[next]}?`)) return;

    const success = await updateOrderStatus(activeOrder.id, next);
    if (!success) return;

    activeOrder.status = next;
    closeOrderDetail();
    await refreshOrders();
});

/* ---------------------------------------------------------
   Quick toggle directly from the table (click a Pending or
   Paid badge to advance it to the next status). Completed
   badges aren't clickable — nothing comes after Completed.
--------------------------------------------------------- */
tableBody.addEventListener('click', async e => {
    const badge = e.target.closest('.status-badge');
    if (!badge || badge.classList.contains('status-completed')) return;

    const row = badge.closest('tr');
    const viewBtn = row.querySelector('.view-btn');
    const orderId = viewBtn ? viewBtn.dataset.id : null;
    if (!orderId) return;

    const order = allOrders.find(o => String(o.id) === String(orderId));
    if (!order) return;

    const normalized = normalizeStatus(order.status);
    const next = NEXT_STATUS[normalized];
    if (!next) return;

    if (!confirm(`Mark ${formatOrderId(order.id)} as ${STATUS_LABELS[next]}?`)) return;

    const success = await updateOrderStatus(order.id, next);
    if (!success) return;

    order.status = next;
    renderTable();
});

/* ---------------------------------------------------------
   SEARCH
--------------------------------------------------------- */
searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value;
    currentPage = 1;
    renderTable();
});

/* ---------------------------------------------------------
   LOGOUT
--------------------------------------------------------- */
logoutBtn.addEventListener('click', async e => {
    e.preventDefault();
    await supabaseClient.auth.signOut();
    window.location.href = 'Admin-login.html';
});

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
async function refreshOrders() {
    allOrders = await loadOrders();
    renderTable();
}

refreshOrders();