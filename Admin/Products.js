const tableBody = document.getElementById('products-table-body');
const addBtn = document.getElementById('add-product-btn');
const formOverlay = document.getElementById('product-form-overlay');
const formCard = formOverlay.querySelector('.product-form-card');
const closeBtn = document.getElementById('form-close-btn');
const form = document.getElementById('product-form');
const photoInput = document.getElementById('product-photo');
const photoPreview = document.getElementById('photo-preview');
const fileChosenLabel = document.getElementById('file-chosen-label');

const PHOTO_PLACEHOLDER_ICON = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <path d="M21 15l-5-5L5 21"></path>
    </svg>
`;

let currentPhotoFile = null;
let currentPhotoUrl = '';

async function getProducts() {
    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching products:', error);
        return [];
    }
    return data;
}

async function renderTable() {
    const products = await getProducts();
    tableBody.innerHTML = '';

    if (!products || products.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-row">No products yet.</td></tr>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');

        const photoHtml = product.image_url
            ? `<img src="${product.image_url}" alt="${product.name}">`
            : `<span class="product-photo-placeholder">${PHOTO_PLACEHOLDER_ICON}</span>`;

        row.innerHTML = `
            <td class="product-photo-cell">
                ${photoHtml}
            </td>
            <td>${product.name}</td>
            <td>₱${product.price}</td>
            <td>${product.stock}</td>
            <td>
                <button class="action-btn edit-btn" data-id="${product.id}" aria-label="Edit product">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                </button>
                <button class="action-btn delete-btn" data-id="${product.id}" aria-label="Delete product">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                        <path d="M10 11v6"></path>
                        <path d="M14 11v6"></path>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                    </svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openForm(btn.dataset.id));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });
}

/* ---------------------------------------------------------
   FORM MODAL
--------------------------------------------------------- */
function lockPageScroll() {
    document.body.style.overflow = 'hidden';
}
function unlockPageScroll() {
    document.body.style.overflow = '';
}

function resetForm() {
    form.reset();
    document.getElementById('product-id').value = '';
    currentPhotoFile = null;
    currentPhotoUrl = '';
    photoPreview.innerHTML = PHOTO_PLACEHOLDER_ICON;
    fileChosenLabel.textContent = 'No File Chosen';
}

function openFormModal() {
    formOverlay.classList.add('open');
    formCard.scrollTop = 0;
    lockPageScroll();
}

function closeFormModal() {
    formOverlay.classList.remove('open');
    unlockPageScroll();
}

async function openForm(id = null) {
    resetForm();

    if (id) {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error loading product:', error);
            return;
        }

        document.getElementById('product-id').value = data.id;
        document.getElementById('product-name').value = data.name;
        document.getElementById('product-price').value = data.price;
        document.getElementById('product-stock').value = data.stock;
        document.getElementById('product-description').value = data.description;
        currentPhotoUrl = data.image_url || '';

        if (currentPhotoUrl) {
            photoPreview.innerHTML = `<img src="${currentPhotoUrl}" alt="preview">`;
        }
    }

    openFormModal();
}

async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;

    const { error } = await supabaseClient
        .from('products')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting product:', error);
        return;
    }

    renderTable();
}

photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;

    currentPhotoFile = file;
    fileChosenLabel.textContent = file.name;

    const reader = new FileReader();
    reader.onload = () => {
        photoPreview.innerHTML = `<img src="${reader.result}" alt="preview">`;
    };
    reader.readAsDataURL(file);
});

async function uploadPhoto(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;

    const { error } = await supabaseClient
        .storage
        .from('product-photos')
        .upload(fileName, file);

    if (error) {
        console.error('Error uploading photo:', error);
        return null;
    }

    const { data } = supabaseClient
        .storage
        .from('product-photos')
        .getPublicUrl(fileName);

    return data.publicUrl;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('product-id').value;
    let imageUrl = currentPhotoUrl;

    if (currentPhotoFile) {
        const uploadedUrl = await uploadPhoto(currentPhotoFile);
        if (uploadedUrl) imageUrl = uploadedUrl;
    }

    const productData = {
        name: document.getElementById('product-name').value,
        price: Number(document.getElementById('product-price').value),
        stock: Number(document.getElementById('product-stock').value),
        description: document.getElementById('product-description').value,
        image_url: imageUrl
    };

    let error;
    if (id) {
        ({ error } = await supabaseClient
            .from('products')
            .update(productData)
            .eq('id', id));
    } else {
        ({ error } = await supabaseClient
            .from('products')
            .insert(productData));
    }

    if (error) {
        console.error('Error saving product:', error);
        alert('Failed to save product. Check the console for details.');
        return;
    }

    renderTable();
    closeFormModal();
});

addBtn.addEventListener('click', () => openForm());
closeBtn.addEventListener('click', closeFormModal);

// Click on the dimmed backdrop (not the card itself) closes the modal.
formOverlay.addEventListener('click', e => {
    if (e.target === formOverlay) closeFormModal();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && formOverlay.classList.contains('open')) closeFormModal();
});

renderTable();