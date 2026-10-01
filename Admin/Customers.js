// --- ADMIN AUTH GUARD ---
(async function enforceAdminAccess() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    // 1. If not logged in at all, redirect to Admin Login
    if (!session) {
        window.location.href = 'Admin-login.html';
        return;
    }

    // 2. Verify if the logged-in user has admin privileges
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

// Rows shown per pagination page. Bump this up once there's real data
// to see how it feels — 5 matches the Figma mock's page count.
const PAGE_SIZE = 5;

const tableBody = document.getElementById('customers-table-body');
const paginationEl = document.getElementById('customers-pagination');
const searchInput = document.getElementById('customer-search');
const detailOverlay = document.getElementById('customer-detail-view');
const detailCard = detailOverlay.querySelector('.customer-detail-card');
const closeBtn = document.getElementById('detail-close-btn');
const deactivateBtn = document.getElementById('deactivate-btn');

let allCustomers = [];      // everything fetched from Supabase
let filteredCustomers = []; // allCustomers after the search filter
let currentPage = 1;
let currentCustomerId = null;

const ICONS = {
    arrowLeft: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>`,
    arrowRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg>`
};

/* ---------------------------------------------------------
   DATA FETCHING
--------------------------------------------------------- */
async function getCustomers() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching customers:', error);
        return [];
    }
    return data;
}

// Fetches from Supabase, then re-applies whatever search/page state is
// already active. Call this after anything that changes the underlying
// data (initial load, deactivate/reactivate).
async function loadCustomers() {
    allCustomers = await getCustomers();
    applyFilterAndRender();
}

/* ---------------------------------------------------------
   SEARCH + PAGINATION (client-side, over the already-fetched list)
--------------------------------------------------------- */
function applyFilterAndRender() {
    const q = searchInput.value.trim().toLowerCase();

    filteredCustomers = !q
        ? allCustomers
        : allCustomers.filter(c => {
            const name = (c.full_name || '').toLowerCase();
            const studentId = (c.student_id || '').toLowerCase();
            return name.includes(q) || studentId.includes(q);
        });

    const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    renderTable();
    renderPagination(totalPages);
}

function renderTable() {
    tableBody.innerHTML = '';

    if (filteredCustomers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="empty-row">No customer records found.</td></tr>';
        return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredCustomers.slice(start, start + PAGE_SIZE);

    pageItems.forEach(customer => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${customer.student_id || '-'}</td>
            <td>${customer.full_name || '-'}</td>
            <td>${customer.year_section || '-'}</td>
            <td>
                <button class="action-btn view-btn" data-id="${customer.id}" aria-label="View customer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
                <button class="action-btn ban-btn" data-id="${customer.id}" aria-label="Deactivate customer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="4.9" y1="4.9" x2="19.1" y2="19.1"></line>
                    </svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => openDetail(btn.dataset.id));
    });

    document.querySelectorAll('.ban-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleActive(btn.dataset.id));
    });
}

function renderPagination(totalPages) {
    paginationEl.innerHTML = '';

    if (totalPages <= 1) return; // nothing to page through

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'page-arrow';
    prevBtn.setAttribute('aria-label', 'Previous page');
    prevBtn.innerHTML = ICONS.arrowLeft;
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
        if (currentPage === 1) return;
        currentPage--;
        renderTable();
        renderPagination(totalPages);
    });
    paginationEl.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.type = 'button';
        pageBtn.className = 'page-number' + (i === currentPage ? ' active' : '');
        pageBtn.textContent = i;
        pageBtn.setAttribute('aria-label', `Page ${i}`);
        pageBtn.addEventListener('click', () => {
            currentPage = i;
            renderTable();
            renderPagination(totalPages);
        });
        paginationEl.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'page-arrow';
    nextBtn.setAttribute('aria-label', 'Next page');
    nextBtn.innerHTML = ICONS.arrowRight;
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => {
        if (currentPage === totalPages) return;
        currentPage++;
        renderTable();
        renderPagination(totalPages);
    });
    paginationEl.appendChild(nextBtn);
}

searchInput.addEventListener('input', () => {
    currentPage = 1;
    applyFilterAndRender();
});

/* ---------------------------------------------------------
   CUSTOMER DETAIL MODAL
--------------------------------------------------------- */
function lockPageScroll() {
    document.body.style.overflow = 'hidden';
}
function unlockPageScroll() {
    document.body.style.overflow = '';
}

function openCustomerModal() {
    detailOverlay.classList.add('open');
    detailCard.scrollTop = 0;
    lockPageScroll();
}

function closeCustomerModal() {
    detailOverlay.classList.remove('open');
    unlockPageScroll();
}

async function openDetail(id) {
    currentCustomerId = id;

    const { data: customer, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error loading customer:', error);
        return;
    }

    document.getElementById('detail-name').textContent = customer.full_name || '-';
    document.getElementById('detail-student-id').textContent = customer.student_id || '-';
    document.getElementById('detail-email').textContent = customer.email || '-';
    document.getElementById('detail-phone').textContent = customer.phone || '-';
    document.getElementById('detail-year-section').textContent = customer.year_section || '-';
    document.getElementById('detail-campus').textContent = customer.school || '-';
    document.getElementById('detail-address').textContent = customer.address || '-';

    deactivateBtn.textContent = customer.is_active === false ? 'Reactivate Account' : 'Deactivate Account';

    const orderList = document.getElementById('order-history-list');
    orderList.innerHTML = '<li>Order history coming soon.</li>';

    openCustomerModal();
}

async function toggleActive(id) {
    const { data: customer } = await supabaseClient
        .from('profiles')
        .select('is_active')
        .eq('id', id)
        .single();

    const newStatus = customer ? customer.is_active === false : true;

    const { error } = await supabaseClient
        .from('profiles')
        .update({ is_active: newStatus })
        .eq('id', id);

    if (error) {
        console.error('Error updating status:', error);
        alert('Failed to update customer status.');
        return;
    }

    loadCustomers();
}

closeBtn.addEventListener('click', closeCustomerModal);

// Click on the dimmed backdrop (not the card itself) closes the modal.
detailOverlay.addEventListener('click', e => {
    if (e.target === detailOverlay) closeCustomerModal();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && detailOverlay.classList.contains('open')) closeCustomerModal();
});

deactivateBtn.addEventListener('click', () => {
    if (currentCustomerId) toggleActive(currentCustomerId);
    closeCustomerModal();
});

loadCustomers();