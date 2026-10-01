// --- ADMIN AUTH GUARD ---
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

// How many rows to show in the Recent Orders / Stocks lists.
const RECENT_ORDERS_LIMIT = 6;
const STOCKS_LIMIT = 6;

// NOTE: `products` table columns (name / stock) are assumed below —
// confirm these match the real schema (e.g. it might be `quantity`
// instead of `stock`) and rename in loadStocks() if needed.

const statOrdersEl = document.getElementById('stat-orders');
const statRevenueEl = document.getElementById('stat-revenue');
const statProductsEl = document.getElementById('stat-products');
const statCustomersEl = document.getElementById('stat-customers');
const recentOrdersBody = document.getElementById('recent-orders-body');
const stocksBody = document.getElementById('stocks-body');

function formatOrderId(id) {
    return `ORD - ${String(id).padStart(4, '0')}`;
}

function formatCurrency(amount) {
    const value = Number(amount) || 0;
    return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function startOfWeek() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const diff = now.getDate() - day;
    const start = new Date(now.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
}

/* ---------------------------------------------------------
   STAT CARDS
--------------------------------------------------------- */
async function loadStats() {
    const weekStart = startOfWeek().toISOString();

    const [ordersThisWeek, productCount, customerCount] = await Promise.all([
        supabaseClient
            .from('orders')
            .select('total_amount', { count: 'exact' })
            .gte('created_at', weekStart),
        supabaseClient
            .from('products')
            .select('id', { count: 'exact', head: true }),
        supabaseClient
            .from('profiles')
            .select('id', { count: 'exact', head: true })
    ]);

    if (ordersThisWeek.error) {
        console.error('Error fetching weekly orders:', ordersThisWeek.error);
    } else {
        const orders = ordersThisWeek.data || [];
        statOrdersEl.textContent = ordersThisWeek.count ?? orders.length;
        const revenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        statRevenueEl.textContent = formatCurrency(revenue);
    }

    if (productCount.error) {
        console.error('Error fetching product count:', productCount.error);
    } else {
        statProductsEl.textContent = productCount.count ?? 0;
    }

    if (customerCount.error) {
        console.error('Error fetching customer count:', customerCount.error);
    } else {
        statCustomersEl.textContent = customerCount.count ?? 0;
    }
}

/* ---------------------------------------------------------
   RECENT ORDERS
--------------------------------------------------------- */
async function loadRecentOrders() {
    const { data, error } = await supabaseClient
        .from('orders')
        .select('id, status, total_amount, user_id, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(RECENT_ORDERS_LIMIT);

    recentOrdersBody.innerHTML = '';

    if (error) {
        console.error('Error fetching recent orders:', error);
        recentOrdersBody.innerHTML = '<tr><td colspan="4" class="empty-row">Could not load orders.</td></tr>';
        return;
    }

    if (!data || data.length === 0) {
        recentOrdersBody.innerHTML = '<tr><td colspan="4" class="empty-row">No orders yet.</td></tr>';
        return;
    }

    data.forEach(order => {
        const customerName = order.profiles?.full_name || '-';
        const statusClass = (order.status || '').toLowerCase();
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatOrderId(order.id)}</td>
            <td>${customerName}</td>
            <td>${formatCurrency(order.total_amount)}</td>
            <td><span class="status-pill ${statusClass}">${order.status || '-'}</span></td>
        `;
        recentOrdersBody.appendChild(row);
    });
}

/* ---------------------------------------------------------
   STOCKS
--------------------------------------------------------- */
async function loadStocks() {
    const { data, error } = await supabaseClient
        .from('products')
        .select('name, stock')
        .order('stock', { ascending: true })
        .limit(STOCKS_LIMIT);

    stocksBody.innerHTML = '';

    if (error) {
        console.error('Error fetching stocks:', error);
        stocksBody.innerHTML = '<tr><td colspan="2" class="empty-row">Could not load stocks.</td></tr>';
        return;
    }

    if (!data || data.length === 0) {
        stocksBody.innerHTML = '<tr><td colspan="2" class="empty-row">No products yet.</td></tr>';
        return;
    }

    data.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.name || '-'}</td>
            <td>${product.stock ?? '-'}</td>
        `;
        stocksBody.appendChild(row);
    });
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
loadStats();
loadRecentOrders();
loadStocks();