const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.setHeaderColor('#0a0f0a');
tg.setBackgroundColor('#0a0f0a');

const API_BASE = 'https://flummoxedly-unpsychopathic-harley.ngrok-free.dev';
const SYNC_INTERVAL_MS = 15_000;

const PERIOD_MAP = {
    monthly: { label: 'мес.', months: 1 },
    quarterly: { label: '3 мес.', months: 3 },
    semiannual: { label: '6 мес.', months: 6 },
    yearly: { label: 'год', months: 12 },
};

const ANALOGIES = [
    { name: 'чашек кофе', price: 250, emoji: '☕' },
    { name: 'походов в кино', price: 500, emoji: '🎬' },
    { name: 'поездок на такси', price: 400, emoji: '🚕' },
    { name: 'бизнес-ланчей', price: 350, emoji: '🍽' },
    { name: 'пачек сигарет', price: 200, emoji: '🚬' },
    { name: 'походов в бар', price: 3000, emoji: '🍺' },
];

let allData = { subscriptions: [], payments: [], beauty: [], usd_rate: 90, profile: null };
let profileData = null;
let pieChart = null;
let syncTimer = null;
let lastSyncTime = null;

// ── Init ──

async function init() {
    setupTabs();
    setupModal();
    setupProfile();

    await Promise.all([loadData(), loadProfile()]);

    updateHeader();
    document.getElementById('loading').classList.add('hidden');

    startAutoSync();
    setupVisibilitySync();
}

function updateHeader() {
    const greeting = document.getElementById('greeting');
    const avatar = document.getElementById('avatar');
    const profileAvatarLg = document.getElementById('profile-avatar-lg');

    const name = profileData?.profile?.first_name
        || tg.initDataUnsafe?.user?.first_name
        || 'Пользователь';

    greeting.textContent = `Привет, ${name}! 👋`;

    const initial = name.charAt(0).toUpperCase();
    avatar.textContent = initial;
    profileAvatarLg.textContent = initial;
}

// ── API ──

async function apiCall(endpoint, method = 'GET', body = null) {
    const url = `${API_BASE}/api${endpoint}`;
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': tg.initData || '',
            'ngrok-skip-browser-warning': 'true',
        },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

async function loadData() {
    try {
        allData = await apiCall('/data');
        showSyncBadge();
    } catch (e) {
        console.warn('API unavailable:', e.message);
    }
    render();
}

async function loadProfile() {
    try {
        profileData = await apiCall('/profile');
        renderProfile();
    } catch (e) {
        console.warn('Profile unavailable');
    }
}

function getDemoData() {
    return {
        subscriptions: [
            { id: 1, name: 'Яндекс Плюс', price: 299, currency: 'RUB', period: 'monthly', billing_day: 15 },
            { id: 2, name: 'ChatGPT Plus', price: 20, currency: 'USD', period: 'monthly', billing_day: 5 },
        ],
        payments: [
            { id: 4, name: 'Квартира', price: 35000, currency: 'RUB', period: 'monthly', billing_day: 1 },
        ],
        beauty: [
            { id: 6, name: 'Маникюр', price: 3000, currency: 'RUB', period: 'monthly', billing_day: 12 },
        ],
        usd_rate: 90,
        profile: null,
    };
}

// ── Auto-sync ──

function startAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(async () => {
        await loadData();
    }, SYNC_INTERVAL_MS);
}

function setupVisibilitySync() {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            await Promise.all([loadData(), loadProfile()]);
            updateHeader();
        }
    });

    try {
        tg.onEvent('viewportChanged', async ({ isStateStable }) => {
            if (isStateStable) {
                await Promise.all([loadData(), loadProfile()]);
                updateHeader();
            }
        });
    } catch (e) { /* older clients */ }
}

function showSyncBadge() {
    lastSyncTime = new Date();
    const badge = document.getElementById('sync-badge');
    badge.classList.add('visible');
    setTimeout(() => badge.classList.remove('visible'), 2000);

    const el = document.getElementById('sync-last');
    if (el) el.textContent = `Последняя синхронизация: ${lastSyncTime.toLocaleTimeString('ru-RU')}`;
}

// ── Helpers ──

function monthlyRub(item) {
    const rate = allData.usd_rate || 90;
    const base = item.currency === 'USD' ? item.price * rate : item.price;
    const period = PERIOD_MAP[item.period] || PERIOD_MAP.monthly;
    return base / period.months;
}

function formatPrice(item) {
    const sym = item.currency === 'USD' ? '$' : '₽';
    const period = PERIOD_MAP[item.period] || PERIOD_MAP.monthly;
    return `${Math.round(item.price)} ${sym}/${period.label}`;
}

function formatNum(n) {
    return Math.round(n).toLocaleString('ru-RU');
}

// ── Render ──

function render() {
    const subs = allData.subscriptions || [];
    const pays = allData.payments || [];
    const beauty = allData.beauty || [];
    const all = [...subs, ...pays, ...beauty];

    const totalMonthly = all.reduce((s, i) => s + monthlyRub(i), 0);
    const totalYearly = totalMonthly * 12;

    document.getElementById('total-monthly').textContent = `${formatNum(totalMonthly)} ₽`;
    document.getElementById('subs-count').textContent = subs.length;
    document.getElementById('pays-count').textContent = pays.length;
    document.getElementById('beauty-count').textContent = beauty.length;
    document.getElementById('monthly-sum').textContent = `${formatNum(totalMonthly)} ₽`;
    document.getElementById('yearly-sum').textContent = `${formatNum(totalYearly)} ₽`;

    renderChart(subs, pays, beauty);
    renderAnalogies(totalMonthly);
    renderUpcoming(all);
    renderList('subs-list', subs, 'subscription');
    renderList('pays-list', pays, 'payment');
    renderList('beauty-list', beauty, 'beauty');

    const subsTotal = subs.reduce((s, i) => s + monthlyRub(i), 0);
    document.getElementById('subs-total').innerHTML =
        `Итого: <span class="neon-text">${formatNum(subsTotal)} ₽/мес.</span>`;

    const paysTotal = [...pays, ...beauty].reduce((s, i) => s + monthlyRub(i), 0);
    document.getElementById('pays-total').innerHTML =
        `Итого: <span class="neon-text">${formatNum(paysTotal)} ₽/мес.</span>`;
}

function renderChart(subs, pays, beauty) {
    const subsSum = subs.reduce((s, i) => s + monthlyRub(i), 0);
    const paysSum = pays.reduce((s, i) => s + monthlyRub(i), 0);
    const beautySum = beauty.reduce((s, i) => s + monthlyRub(i), 0);

    const data = [];
    const labels = [];
    const colors = [];

    if (subsSum > 0) { data.push(subsSum); labels.push('Подписки'); colors.push('#39ff14'); }
    if (paysSum > 0) { data.push(paysSum); labels.push('Платежи'); colors.push('#14b8ff'); }
    if (beautySum > 0) { data.push(beautySum); labels.push('Бьюти'); colors.push('#ff14b8'); }

    if (data.length === 0) {
        data.push(1); labels.push('Нет данных'); colors.push('#333');
    }

    const ctx = document.getElementById('pie-chart').getContext('2d');
    if (pieChart) pieChart.destroy();

    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderColor: '#0a0f0a',
                borderWidth: 3,
            }],
        },
        options: {
            responsive: true,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#888',
                        padding: 16,
                        font: { size: 13 },
                        usePointStyle: true,
                        pointStyleWidth: 10,
                    },
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${formatNum(ctx.raw)} ₽/мес.`,
                    },
                },
            },
        },
    });
}

function renderAnalogies(total) {
    const container = document.getElementById('analogies');
    if (total <= 0) {
        container.innerHTML = '<div class="empty-state">Добавьте подписки для аналогий</div>';
        return;
    }

    let html = '<h3 class="section-title">Это как если бы вы покупали</h3>';
    ANALOGIES.forEach(a => {
        const count = total / a.price;
        if (count >= 0.5) {
            html += `
                <div class="analogy-item">
                    <span>${a.emoji}</span>
                    <span>${a.name}</span>
                    <span class="analogy-value">${count.toFixed(1)}</span>
                </div>`;
        }
    });
    container.innerHTML = html;
}

function renderUpcoming(items) {
    const container = document.getElementById('upcoming-list');
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет записей</div>';
        return;
    }

    const today = new Date().getDate();
    const sorted = [...items].sort((a, b) => {
        const dA = a.billing_day >= today ? a.billing_day - today : a.billing_day + 31 - today;
        const dB = b.billing_day >= today ? b.billing_day - today : b.billing_day + 31 - today;
        return dA - dB;
    });

    const upcoming = sorted.slice(0, 5);
    container.innerHTML = upcoming.map(item => {
        const daysLeft = item.billing_day >= today
            ? item.billing_day - today
            : item.billing_day + 31 - today;
        const dateText = daysLeft === 0 ? 'Сегодня'
            : daysLeft === 1 ? 'Завтра'
            : `через ${daysLeft} дн.`;
        const sym = item.currency === 'USD' ? '$' : '₽';
        return `
            <div class="upcoming-item">
                <div>
                    <div class="upcoming-name">${item.name}</div>
                    <div class="upcoming-date">${item.billing_day}-го числа · ${dateText}</div>
                </div>
                <div class="upcoming-price">${Math.round(item.price)} ${sym}</div>
            </div>`;
    }).join('');
}

function renderList(containerId, items, type) {
    const container = document.getElementById(containerId);
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state">Пока пусто</div>';
        return;
    }

    container.innerHTML = items.map(item => {
        const rub = monthlyRub(item);
        const rubText = item.currency === 'USD' ? `~${formatNum(rub)} ₽/мес.` : '';
        return `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-details">Оплата ${item.billing_day}-го числа</div>
                </div>
                <div class="item-price">
                    <div class="item-price-main">${formatPrice(item)}</div>
                    ${rubText ? `<div class="item-price-sub">${rubText}</div>` : ''}
                </div>
                <button class="btn-delete" onclick="deleteItem(${item.id})" title="Удалить">🗑</button>
            </div>`;
    }).join('');
}

// ── Profile ──

function renderProfile() {
    if (!profileData) return;
    const p = profileData.profile || {};
    const s = profileData.stats || {};

    const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Пользователь';
    document.getElementById('profile-name').textContent = fullName;
    document.getElementById('profile-avatar-lg').textContent = (fullName.charAt(0) || '?').toUpperCase();

    const usernameEl = document.getElementById('profile-username');
    if (p.username) {
        usernameEl.textContent = `@${p.username}`;
    } else {
        usernameEl.textContent = '';
    }

    if (p.joined_at) {
        const d = new Date(p.joined_at);
        document.getElementById('profile-joined').textContent =
            `С нами с ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }

    document.getElementById('profile-subs').textContent = s.subscriptions_count ?? 0;
    document.getElementById('profile-pays').textContent = s.payments_count ?? 0;
    document.getElementById('profile-beauty').textContent = s.beauty_count ?? 0;
    document.getElementById('profile-total-m').textContent = `${formatNum(s.total_monthly_rub || 0)} ₽`;
    document.getElementById('profile-total-y').textContent = `${formatNum(s.total_yearly_rub || 0)} ₽`;
    document.getElementById('profile-rate').textContent = `${(profileData.usd_rate || 0).toFixed(2)} ₽`;

    const currSel = document.getElementById('pref-currency');
    if (p.preferred_currency) currSel.value = p.preferred_currency;
}

function setupProfile() {
    document.getElementById('profile-btn').addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="profile"]').classList.add('active');
        document.getElementById('tab-profile').classList.add('active');
    });

    document.getElementById('pref-currency').addEventListener('change', async (e) => {
        try {
            await apiCall('/set-currency', 'POST', { currency: e.target.value });
            showSyncBadge();
        } catch (err) {
            console.warn('Failed to save currency preference');
        }
    });
}

// ── Actions ──

async function deleteItem(id) {
    if (!confirm('Удалить?')) return;
    try {
        await apiCall(`/delete/${id}`, 'POST');
    } catch (e) {
        removeLocalItem(id);
    }
    await loadData();
}

function removeLocalItem(id) {
    ['subscriptions', 'payments', 'beauty'].forEach(key => {
        allData[key] = (allData[key] || []).filter(i => i.id !== id);
    });
}

async function saveItem() {
    const name = document.getElementById('inp-name').value.trim();
    const price = parseFloat(document.getElementById('inp-price').value);
    const currency = document.getElementById('inp-currency').value;
    const period = document.getElementById('inp-period').value;
    const day = parseInt(document.getElementById('inp-day').value);
    const entryType = document.getElementById('inp-type').value;

    if (!name || !price || !day || day < 1 || day > 31) {
        tg.showAlert('Заполните все поля корректно');
        return;
    }

    const body = { name, price, currency, period, billing_day: day, entry_type: entryType };

    try {
        await apiCall('/add', 'POST', body);
    } catch (e) {
        const fakeId = Date.now();
        const item = { id: fakeId, ...body };
        if (entryType === 'subscription') allData.subscriptions.push(item);
        else if (entryType === 'beauty') allData.beauty.push(item);
        else allData.payments.push(item);
    }

    closeModal();
    await loadData();
    await loadProfile();
}

// ── Tabs ──

function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });
}

// ── Modal ──

function setupModal() {
    document.getElementById('btn-add-sub').addEventListener('click', () => openModal('subscription'));
    document.getElementById('btn-add-pay').addEventListener('click', () => openModal('payment'));
    document.getElementById('btn-add-beauty').addEventListener('click', () => openModal('beauty'));
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });
    document.getElementById('btn-save').addEventListener('click', saveItem);
}

function openModal(type) {
    document.getElementById('inp-type').value = type;
    const titles = {
        subscription: 'Новая подписка',
        payment: 'Новый платёж',
        beauty: 'Бьюти-процедура',
    };
    document.getElementById('modal-title').textContent = titles[type] || 'Добавить';
    document.getElementById('inp-name').value = '';
    document.getElementById('inp-price').value = '';
    document.getElementById('inp-day').value = '';
    document.getElementById('inp-currency').value = allData.profile?.preferred_currency || 'RUB';
    document.getElementById('inp-period').value = 'monthly';
    document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
}

// ── Start ──

init();
