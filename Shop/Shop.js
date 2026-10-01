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

function renderProducts(productList) {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = '';

    productList.forEach(product => {
        const card = document.createElement('a');
        card.className = 'product-card';
        card.href = `../ProductDetail/ProductDetail.html?id=${product.id}`;

        const imageHtml = product.image_url
            ? `<img class="product-image" src="${product.image_url}" alt="${product.name}">`
            : `<div class="product-image no-image">No image</div>`;

        card.innerHTML = `
            ${imageHtml}
            <p class="product-name">${product.name}</p>
            <p class="product-desc">${product.description || ''}</p>
            <p class="product-price">₱${product.price.toLocaleString()}</p>
        `;

        grid.appendChild(card);
    });
}

async function init() {
    const products = await getProducts();
    renderProducts(products);
}

init();