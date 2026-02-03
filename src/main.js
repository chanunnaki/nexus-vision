let modelCache = [];
let currentBalance = 0;
let generationHistory = JSON.parse(localStorage.getItem('nexus_history') || '[]');
const ENHANCEMENT_SYSTEM_PROMPT = "You are an expert prompt engineer. Expand the input into a single vivid paragraph. Output ONLY the prompt. No preamble.";

export function formatBalance(val) {
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export async function updateBalanceOnly() {
    try {
        const res = await fetch(`https://image.1984.ie/balance?t=${Date.now()}`);
        const data = await res.json();
        currentBalance = data.balance;
        document.getElementById('pollenCount').textContent = formatBalance(currentBalance);
        updateModelPrice();
    } catch (err) { console.error("Balance fetch failed", err); }
}

export async function fetchMetadata() {
    document.getElementById('systemPromptText').textContent = ENHANCEMENT_SYSTEM_PROMPT;
    await updateBalanceOnly();

    try {
        const mRes = await fetch('https://image.1984.ie/models');
        const rawModels = await mRes.json();
        const getCost = (m) => (m.pricing && m.pricing.completionImageTokens) ? parseFloat(m.pricing.completionImageTokens) : 0;
        modelCache = rawModels.filter(m => m.output_modalities?.includes('image')).sort((a,b) => getCost(a) - getCost(b));
        
        const select = document.getElementById('modelSelect');
        select.innerHTML = '';
        const cats = { 'Pollen / Image': m => !m.pricing?.promptTextTokens, 'Pollen / Token': m => m.pricing?.promptTextTokens > 0 };
        Object.keys(cats).forEach(label => {
            const group = document.createElement('optgroup');
            group.label = label;
            modelCache.filter(cats[label]).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                const cost = getCost(m);
                const name = (m.description ? m.description.split(' - ')[0] : m.name).toUpperCase();
                opt.textContent = `${name} [${cost.toFixed(4)}${m.pricing?.promptTextTokens ? '+' : ''}]`;
                if (m.name === 'flux') opt.selected = true;
                group.appendChild(opt);
            });
            select.appendChild(group);
        });
        updateModelPrice();
        if (window.lucide) window.lucide.createIcons();
        updateThemeUI();
        
        const strip = document.getElementById('filmstrip');
        strip.addEventListener('click', handleHistoryClick);
        renderHistory();
    } catch (e) {
        document.getElementById('modelSelect').innerHTML = '<option value="flux">FLUX SCHNELL</option>';
    }
}

window.toggleTheme = function() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('nexus_theme', isDark ? 'dark' : 'light');
    updateThemeUI();
}

export function updateThemeUI() {
    const currentIsDark = document.documentElement.classList.contains('dark');
    const icon = document.getElementById('themeIcon');
    if (icon && window.lucide) {
        icon.setAttribute('data-lucide', currentIsDark ? 'moon' : 'sun');
        window.lucide.createIcons();
    }
}

window.updateModelPrice = function() {
    const selected = modelCache.find(m => m.name === document.getElementById('modelSelect').value);
    if (selected && selected.pricing) {
        const cost = parseFloat(selected.pricing.completionImageTokens) || 0;
        document.getElementById('modelCost').textContent = cost.toFixed(4) + (selected.pricing.promptTextTokens ? "+" : "");
        document.getElementById('remGens').textContent = cost > 0 ? Math.floor(currentBalance/cost).toLocaleString() : "∞";
        selected.pricing.promptTextTokens ? document.getElementById('priceMode').classList.remove('hidden') : document.getElementById('priceMode').classList.add('hidden');
    }
}

window.updateLayoutRatio = function() {
    const ratio = document.getElementById('aspectRatio').value.split('x');
    document.getElementById('resultArea').style.aspectRatio = `${ratio[0]} / ${ratio[1]}`;
}

window.toggleHint = function() {
    const el = document.getElementById('promptHint');
    const btn = document.getElementById('hintBtn');
    const isOpen = el.style.display === 'block';
    el.style.display = isOpen ? 'none' : 'block';
    if (isOpen) {
        btn.classList.remove('bg-emerald-500/10', 'text-emerald-500', 'border-emerald-500');
    } else {
        btn.classList.add('bg-emerald-500/10', 'text-emerald-500', 'border-emerald-500');
    }
}

window.enhancePrompt = async function() {
    const input = document.getElementById('promptInput');
    if (!input.value) return;
    const btn = document.getElementById('enhanceBtn');
    const text = document.getElementById('enhanceText');
    const icon = document.getElementById('enhanceIcon');
    btn.disabled = true; input.classList.add('augmenting');
    const orig = text.textContent; text.textContent = "Augmenting..."; icon.classList.add('animate-spin');
    try {
        const res = await fetch('https://image.1984.ie/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "grok", messages: [{role:'system', content: ENHANCEMENT_SYSTEM_PROMPT}, {role:'user', content: input.value}], max_tokens: 500 })
        });
        const data = await res.json();
        let txt = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.content_blocks?.filter(b=>b.type==='text').map(b=>b.text).join('\n');
        if (txt) { 
            input.value = txt.trim(); 
            setTimeout(updateBalanceOnly, 1000); 
        }
    } catch (e) {} finally { btn.disabled = false; input.classList.remove('augmenting'); text.textContent = orig; icon.classList.remove('animate-spin'); }
}

window.generateImage = function() {
    const model = document.getElementById('modelSelect').value;
    const promptVal = document.getElementById('promptInput').value;
    const neg = document.getElementById('negativeInput').value;
    const ratio = document.getElementById('aspectRatio').value;
    const seedIn = document.getElementById('seedInput').value;
    if (!promptVal) return;
    const overlay = document.getElementById('loadingOverlay');
    const actions = document.getElementById('floatingActions');
    overlay.classList.remove('hidden'); actions.classList.add('hidden');
    const dims = ratio.split('x');
    const seed = seedIn === "-1" ? Math.floor(Math.random()*1000000000) : seedIn;
    const url = `https://image.1984.ie/${encodeURIComponent(promptVal)}?model=${model}&seed=${seed}&width=${dims[0]}&height=${dims[1]}&negative_prompt=${encodeURIComponent(neg)}`;
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
        document.getElementById('outputImage').src = url;
        document.getElementById('outputImage').classList.remove('hidden');
        document.getElementById('placeholderText').classList.add('hidden');
        overlay.classList.add('hidden'); actions.classList.remove('hidden');
        addToHistory({ url, model, prompt: promptVal, negative: neg, ratio, seed });
        setTimeout(updateBalanceOnly, 1000);
    };
    img.src = url;
}

function addToHistory(item) {
    generationHistory.unshift(item);
    if (generationHistory.length > 50) generationHistory.pop();
    localStorage.setItem('nexus_history', JSON.stringify(generationHistory));
    const strip = document.getElementById('filmstrip');
    strip.prepend(createHistoryElement(item));
    if (strip.children.length > 50) strip.lastElementChild.remove();
    document.getElementById('historyCount').textContent = generationHistory.length;
    if (window.lucide) window.lucide.createIcons();
}

function createHistoryElement(item) {
    const div = document.createElement('div');
    div.className = 'history-item group relative rounded-lg shadow-lg border-2 border-neutral-200 dark:border-neutral-800 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all duration-200 shrink-0 overflow-hidden w-[120px] h-[120px] cursor-pointer';
    div.innerHTML = `
        <img src="${item.url}" loading="lazy" class="w-full h-full object-cover pointer-events-none" />
        <button class="delete-btn absolute top-1 right-1 p-1 bg-black/60 text-white/60 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all duration-200 z-20">
            <i data-lucide="x" class="w-3 h-3"></i>
        </button>
    `;
    return div;
}

function renderHistory() {
    const strip = document.getElementById('filmstrip');
    strip.innerHTML = '';
    const fragment = document.createDocumentFragment();
    generationHistory.forEach(item => fragment.appendChild(createHistoryElement(item)));
    strip.appendChild(fragment);
    document.getElementById('historyCount').textContent = generationHistory.length;
    if (window.lucide) window.lucide.createIcons();
}

function handleHistoryClick(e) {
    const itemEl = e.target.closest('.history-item');
    if (!itemEl) return;
    const index = Array.from(itemEl.parentNode.children).indexOf(itemEl);
    if (e.target.closest('.delete-btn')) {
        generationHistory.splice(index, 1);
        localStorage.setItem('nexus_history', JSON.stringify(generationHistory));
        itemEl.remove();
        document.getElementById('historyCount').textContent = generationHistory.length;
        return;
    }
    restoreFromHistory(index);
}

function restoreFromHistory(index) {
    const item = generationHistory[index];
    if (!item) return;
    document.getElementById('modelSelect').value = item.model;
    document.getElementById('promptInput').value = item.prompt;
    document.getElementById('negativeInput').value = item.negative || '';
    document.getElementById('aspectRatio').value = item.ratio;
    document.getElementById('seedInput').value = item.seed;
    updateLayoutRatio(); updateModelPrice();
    const main = document.getElementById('outputImage');
    main.src = item.url; main.classList.remove('hidden');
    document.getElementById('placeholderText').classList.add('hidden');
    document.getElementById('floatingActions').classList.remove('hidden');
}

window.clearHistory = function() { 
    if (confirm("Wipe Archive?")) { 
        generationHistory = []; 
        localStorage.removeItem('nexus_history'); 
        document.getElementById('filmstrip').innerHTML = '';
        document.getElementById('historyCount').textContent = '0';
    } 
}

window.toggleFullscreen = function() { 
    const img = document.getElementById('outputImage'); 
    if (img.requestFullscreen) img.requestFullscreen(); 
    else if (img.webkitRequestFullscreen) img.webkitRequestFullscreen(); 
}

window.copyToClipboard = async function() {
    const toast = document.getElementById('copyToast');
    try {
        const res = await fetch(document.getElementById('outputImage').src);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast.classList.remove('opacity-0'); setTimeout(() => toast.classList.add('opacity-0'), 2000);
    } catch (e) { alert("Copy failed. Try Download."); }
}

window.downloadImage = function() { 
    const a = document.createElement('a'); 
    a.href = document.getElementById('outputImage').src; 
    a.download = `vision-${Date.now()}.jpg`; 
    a.click(); 
}

// Initial Kickoff
fetchMetadata();
