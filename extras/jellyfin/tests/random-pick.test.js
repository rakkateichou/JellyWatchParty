const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../random_pick_watching_row.js'), 'utf8');
const id = value => value.repeat(32);
const movie = value => ({ Id: id(value), Name: `Movie ${value}`, Type: 'Movie' });
const series = value => ({ Id: id(value), Name: `Series ${value}`, Type: 'Series' });
const episode = (value, parent) => ({ Id: id(value), Type: 'Episode', SeriesId: id(parent) });

function harness({ rows = [], items = [], library = [], intercept } = {}) {
    const frames = [];
    const calls = [];
    let observer;
    let user = 'viewer-1';
    let section;
    const history = [];
    const container = {
        get innerHTML() { return history.at(-1) || ''; },
        set innerHTML(value) { history.push(value); },
        querySelector: () => ({ addEventListener() {} })
    };
    const shuffle = { addEventListener(_event, callback) { this.click = callback; } };
    const document = {
        readyState: 'complete', body: {}, head: { appendChild() {} }, getElementById: () => null,
        createElement(tag) {
            if (tag === 'style') return {};
            const classes = new Set();
            return {
                isConnected: true,
                classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
                querySelector: selector => selector === '.itemsContainer' ? container : shuffle,
                closest: () => ({ hidden: false })
            };
        },
        querySelector: () => ({ querySelector: () => section, appendChild(value) { section = value; } }),
        querySelectorAll: () => rows.map(row => ({
            hidden: !!row.hidden,
            classList: { contains: name => name === 'hide' && !!row.hide },
            querySelector: selector => row.kind === 'resume'
                ? selector === ':scope > h2' || selector.includes('videoplayback')
                : selector.includes('type=nextup'),
            querySelectorAll: () => row.ids.map(value => ({ dataset: { id: value }, closest: () => null }))
        }))
    };
    const api = {
        getCurrentUserId: () => user,
        serverAddress: () => 'https://jellyfin.example',
        async getItems(userId, options) {
            calls.push({ userId, ...options });
            if (intercept) {
                const result = intercept(options, calls.length);
                if (result !== undefined) return result;
            }
            if (options.Ids) return { Items: items.filter(item => options.Ids.split(',').includes(item.Id)) };
            const excluded = options.ExcludeItemIds.split(',');
            return { Items: library.filter(item => !excluded.includes(item.Id)).slice(0, 1) };
        }
    };
    vm.runInNewContext(source, {
        window: { ApiClient: api, location: { origin: 'https://jellyfin.example' } },
        document, URLSearchParams, console: { warn() {} },
        requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
        MutationObserver: class { constructor(callback) { observer = callback; } observe() {} }
    });
    return {
        rows, calls, history, container, shuffle,
        mutate: () => observer(), setUser: value => { user = value; observer(); },
        async flush() {
            for (let round = 0; round < 20; round++) {
                frames.splice(0).forEach(callback => callback());
                await new Promise(resolve => setImmediate(resolve));
                if (!frames.length) return;
            }
            throw new Error('Random Pick keeps refreshing without a watching-row change');
        }
    };
}

test('excludes watching movies and the series behind episodes in both sections', async () => {
    const page = harness({
        rows: [{ kind: 'resume', ids: [id('a'), id('b')] }, { kind: 'next', ids: [id('d')] }],
        items: [movie('a'), episode('b', 'c'), episode('d', 'e')],
        library: [movie('a'), series('c'), series('e'), movie('f')]
    });
    await page.flush();
    const query = page.calls.find(call => call.SortBy === 'Random');
    assert.deepEqual(new Set(query.ExcludeItemIds.split(',')), new Set(['a', 'b', 'c', 'd', 'e'].map(id)));
    assert.match(page.container.innerHTML, /Movie f/);
    page.mutate();
    await page.flush();
    assert.equal(page.calls.length, 2, 'own card rendering must not trigger another request');
});

test('normalizes UUID card IDs and does not exclude hidden sections', async () => {
    const page = harness({
        rows: [{ kind: 'resume', ids: ['AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'] }, { kind: 'next', ids: [id('b')], hide: true }],
        items: [movie('a')], library: [movie('a'), movie('b')]
    });
    await page.flush();
    assert.match(page.container.innerHTML, /Movie b/);
    assert.equal(page.calls.at(-1).ExcludeItemIds, id('a'));
});

test('replaces a pick when Next Up loads later and includes that series', async () => {
    const page = harness({
        rows: [{ kind: 'resume', ids: [id('a')] }],
        items: [movie('a'), episode('b', 'c')], library: [series('c'), movie('d')]
    });
    await page.flush();
    assert.match(page.container.innerHTML, /Series c/);
    page.rows.push({ kind: 'next', ids: [id('b')] });
    page.mutate();
    await page.flush();
    assert.match(page.container.innerHTML, /Movie d/);
    assert.deepEqual(page.calls.filter(call => call.Ids).map(call => call.Ids), [id('a'), id('b')]);
});

test('discards an in-flight pick if a watching section changes', async () => {
    let resolveRandom;
    let first = true;
    const page = harness({
        rows: [{ kind: 'resume', ids: [id('a')] }], items: [movie('a'), episode('b', 'c')],
        library: [series('c'), movie('d')],
        intercept(options) {
            if (options.SortBy === 'Random' && first) {
                first = false;
                return new Promise(resolve => { resolveRandom = resolve; });
            }
        }
    });
    await page.flush();
    page.rows.push({ kind: 'next', ids: [id('b')] });
    page.mutate();
    await page.flush();
    resolveRandom({ Items: [series('c')] });
    await page.flush();
    assert.match(page.container.innerHTML, /Movie d/);
    assert.equal(page.history.some(html => html.includes('Series c')), false);
});

test('shuffle uses exclusions while reusing the episode metadata', async () => {
    const page = harness({ rows: [{ kind: 'next', ids: [id('a')] }], items: [episode('a', 'b')], library: [series('b'), movie('c')] });
    await page.flush();
    page.shuffle.click();
    await page.flush();
    assert.equal(page.calls.filter(call => call.Ids).length, 1);
    assert.equal(page.calls.filter(call => call.SortBy === 'Random').length, 2);
    assert.match(page.container.innerHTML, /Movie c/);
});

test('changing users refreshes exclusions instead of sharing a previous user cache', async () => {
    const page = harness({ rows: [{ kind: 'resume', ids: [id('a')] }], items: [movie('a')], library: [movie('b')] });
    await page.flush();
    page.setUser('viewer-2');
    await page.flush();
    assert.equal(page.calls.filter(call => call.Ids).length, 2);
    assert.equal(page.calls.at(-1).userId, 'viewer-2');
});

test('shows a clear empty state when every available title is already displayed', async () => {
    const page = harness({ rows: [{ kind: 'resume', ids: [id('a')] }], items: [movie('a')], library: [movie('a')] });
    await page.flush();
    assert.match(page.container.innerHTML, /No other movies or series to pick/);
    assert.equal(page.calls.length, 2);
});

test('does not fall back to an unfiltered pick when watching metadata cannot load', async () => {
    const page = harness({
        rows: [{ kind: 'next', ids: [id('a')] }], library: [series('b')],
        intercept(options) { if (options.Ids) return Promise.reject(new Error('offline')); }
    });
    await page.flush();
    assert.match(page.container.innerHTML, /Try another pick/);
    assert.equal(page.calls.filter(call => call.SortBy === 'Random').length, 0);
});
