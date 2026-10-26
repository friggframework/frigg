'use strict';

const container = document.querySelector('#modules');
const status = document.querySelector('#status');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
let records = [];

function element(tag, text, className) {
    const item = document.createElement(tag);
    if (text) item.textContent = text;
    if (className) item.className = className;
    return item;
}

function link(label, url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Invalid catalog link');
    const item = element('a', label);
    item.href = parsed.href;
    return item;
}

function render() {
    const needle = search.value.trim().toLowerCase();
    const selected = records.filter(record => (!category.value || record.category === category.value) &&
        [record.name, record.provider, record.description, record.identity.package, ...record.capabilities].join(' ').toLowerCase().includes(needle));
    container.replaceChildren();
    for (const record of selected) {
        const article = document.createElement('article');
        article.append(element('span', record.category, 'badge'), element('span', record.status, 'badge'), element('h2', record.name), element('p', record.description));
        const version = record.latestStable || record.identity.version;
        article.append(element('code', `npm install ${record.identity.package}@${version}`));
        article.append(element('p', record.latestStable ? `Stable ${version}` : `Prerelease ${version} · no stable release imported`, 'detail'));
        article.append(element('p', `Declared Frigg: ${record.compatibility.frigg || 'unknown'} · Node: ${record.compatibility.node || 'unknown'}`, 'detail'));
        article.append(element('p', `Tested compatibility: ${record.compatibility.tested.length ? record.compatibility.tested.join(', ') : 'no runtime version matrix declared'}`, 'detail'));
        article.append(element('p', `Maintainers: ${record.maintainers.join(', ')} · ${record.license}`, 'detail'));
        if (record.extensions.length) article.append(element('p', `Included extensions: ${record.extensions.join(', ')}`, 'detail'));
        const nav = document.createElement('nav');
        nav.setAttribute('aria-label', `${record.name} links`);
        nav.append(link('Versioned docs ↗', `https://docs.friggframework.org${record.docsPath}`), link('Source ↗', record.links.source), link('Support ↗', record.links.support), link('Release notes ↗', record.links.releaseNotes));
        article.append(nav); container.append(article);
    }
    status.textContent = !records.length ? 'No release bundles have been imported yet. Published modules will appear here as their documentation is delivered.' : selected.length ? `${selected.length} ${selected.length === 1 ? 'module' : 'modules'}` : 'No modules match your search. Try another provider or capability.';
}

fetch('/data/catalog/index.json').then(response => {
    if (!response.ok) throw new Error('Catalog unavailable');
    return response.json();
}).then(data => {
    if (!Array.isArray(data)) throw new Error('Invalid catalog');
    records = data;
    for (const value of [...new Set(records.map(x => x.category))].sort()) {
        const option = element('option', value); option.value = value; category.append(option);
    }
    render();
}).catch(() => {
    status.textContent = 'The module directory could not be loaded. Please try again or browse the documentation.';
});
search.addEventListener('input', render);
category.addEventListener('change', render);
