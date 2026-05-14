/**
 * E2E tests for `<video>` and `<audio>` retention in markdown output.
 *
 * The `media-retention` markify rule in snapshot-formatter mirrors the
 * `retainImages` semantics for media elements: `none`, `alt`, `all`, `all_p`.
 * Source resolution prefers `<source src>`, then `<source srcset>` (first
 * candidate), then `<source data-src>`; relative URLs rebase against the
 * page URL. These tests use small inline HTML strings so the assertions
 * don't depend on any external resource.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getAgent } from '../helpers/client';

async function crawlHtml(html: string, opts: Record<string, unknown> = {}) {
    return getAgent()
        .post('/')
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .send({ html, url: 'https://example.com/test', ...opts });
}

const VIDEO_HTML = `<html><body>
    <p>Intro paragraph so readability keeps the article.</p>
    <video><source src="https://example.com/clip.mp4" type="video/mp4"></video>
    <p>Outro paragraph after the video.</p>
</body></html>`;

const AUDIO_HTML = `<html><body>
    <p>Intro paragraph so readability keeps the article.</p>
    <audio><source src="https://example.com/song.mp3" type="audio/mpeg"></audio>
    <p>Outro paragraph after the audio.</p>
</body></html>`;

const MIXED_HTML = `<html><body>
    <p>Intro paragraph.</p>
    <video><source src="https://example.com/v1.mp4"></video>
    <audio><source src="https://example.com/a1.mp3"></audio>
    <video><source src="https://example.com/v2.mp4"></video>
    <p>Outro paragraph.</p>
</body></html>`;

describe('retainImages: all (default) — video', () => {
    it('renders <video> as markdown image with the source URL', async () => {
        const res = await crawlHtml(VIDEO_HTML, { retainImages: 'all', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/example\.com\/clip\.mp4\)/);
    });
});

describe('retainImages: all (default) — audio', () => {
    it('renders <audio> as markdown image with the source URL', async () => {
        const res = await crawlHtml(AUDIO_HTML, { retainImages: 'all', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        assert.match(res.body.data.content, /!\[Audio \d+\]\(https:\/\/example\.com\/song\.mp3\)/);
    });
});

describe('retainImages: none — media', () => {
    it('removes <video> entirely', async () => {
        const res = await crawlHtml(VIDEO_HTML, { retainImages: 'none', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        assert.doesNotMatch(res.body.data.content, /clip\.mp4/);
        assert.doesNotMatch(res.body.data.content, /Video \d+/);
    });

    it('removes <audio> entirely', async () => {
        const res = await crawlHtml(AUDIO_HTML, { retainImages: 'none', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        assert.doesNotMatch(res.body.data.content, /song\.mp3/);
        assert.doesNotMatch(res.body.data.content, /Audio \d+/);
    });
});

describe('retainImages: alt — media', () => {
    it('replaces <video> with a "(Video N)" placeholder', async () => {
        const res = await crawlHtml(VIDEO_HTML, { retainImages: 'alt', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        assert.match(res.body.data.content, /\(Video \d+\)/);
        assert.doesNotMatch(res.body.data.content, /clip\.mp4/);
    });

    it('replaces <audio> with an "(Audio N)" placeholder', async () => {
        const res = await crawlHtml(AUDIO_HTML, { retainImages: 'alt', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        assert.match(res.body.data.content, /\(Audio \d+\)/);
        assert.doesNotMatch(res.body.data.content, /song\.mp3/);
    });

    it('does not produce markdown media links in alt mode', async () => {
        const res = await crawlHtml(VIDEO_HTML, { retainImages: 'alt', respondWith: 'markdown' });
        assert.doesNotMatch(res.body.data.content, /!\[.*?\]\(http/);
    });
});

describe('retainImages: all_p — media', () => {
    it('renders <video> as markdown image (URL retained)', async () => {
        const res = await crawlHtml(VIDEO_HTML, { retainImages: 'all_p', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/example\.com\/clip\.mp4\)/);
    });
});

describe('media source resolution', () => {
    it('uses <source src> when present', async () => {
        const html = `<html><body><p>x</p><video><source src="https://cdn.example.com/a.mp4"></video><p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /\(https:\/\/cdn\.example\.com\/a\.mp4\)/);
    });

    it('falls back to the first <source srcset> candidate when src is absent', async () => {
        const html = `<html><body><p>x</p>
            <video><source srcset="https://cdn.example.com/hi.mp4 2x, https://cdn.example.com/lo.mp4 1x"></video>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /\(https:\/\/cdn\.example\.com\/hi\.mp4/);
    });

    it('falls back to <source data-src> when neither src nor srcset is present', async () => {
        const html = `<html><body><p>x</p>
            <video><source data-src="https://cdn.example.com/lazy.mp4"></video>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /\(https:\/\/cdn\.example\.com\/lazy\.mp4\)/);
    });

    it('rebases relative source URLs against the page URL', async () => {
        const html = `<html><body><p>x</p>
            <video><source src="/media/relative.mp4"></video>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { url: 'https://example.com/articles/123', retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /\(https:\/\/example\.com\/media\/relative\.mp4\)/);
    });
});

describe('embedded video iframes', () => {
    it('rewrites a YouTube embed iframe to the canonical watch URL', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allowfullscreen></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ\)/);
    });

    it('handles youtube-nocookie.com embeds', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="https://www.youtube-nocookie.com/embed/abcDEF12345"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/www\.youtube\.com\/watch\?v=abcDEF12345\)/);
    });

    it('rewrites a Bilibili player iframe to the canonical BV URL', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="//player.bilibili.com/player.html?bvid=BV1xx411c7mD&page=1&autoplay=0"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { url: 'https://example.com/articles/1', retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/www\.bilibili\.com\/video\/BV1xx411c7mD\)/);
    });

    it('preserves a Bilibili iframe that lacks bvid (legacy aid form)', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="https://player.bilibili.com/player.html?aid=12345&page=1"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/player\.bilibili\.com\/player\.html\?aid=12345/);
    });

    it('normalizes Vimeo player iframes to vimeo.com/<id>', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="https://player.vimeo.com/video/76979871"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/vimeo\.com\/76979871\)/);
    });

    it('normalizes Dailymotion embed iframes', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="https://www.dailymotion.com/embed/video/x7tgcdz"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/www\.dailymotion\.com\/video\/x7tgcdz\)/);
    });

    it('drops non-video iframes that have no inner content', async () => {
        const html = `<html><body><p>before</p>
            <iframe src="https://example.com/ads/banner.html"></iframe>
            <p>after</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        const content: string = res.body.data.content;
        assert.doesNotMatch(content, /!\[Video/);
        assert.doesNotMatch(content, /ads\/banner/);
        // text content around the iframe survives
        assert.match(content, /before/);
        assert.match(content, /after/);
    });

    it('exposes fallback content inside a non-video iframe as-is', async () => {
        const html = `<html><body><p>before</p>
            <iframe src="https://example.com/widget.html"><p>Your browser does not support iframes.</p></iframe>
            <p>after</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        const content: string = res.body.data.content;
        // The iframe is dropped (no markdown link emitted) and its fallback
        // paragraph is rendered as a normal paragraph between `before` and `after`.
        assert.doesNotMatch(content, /!\[Video/);
        assert.match(content, /before\n\nYour browser does not support iframes\.\n\nafter/);
    });

    it('a video iframe emits the video link and drops the fallback content', async () => {
        // Fallback content inside a video iframe is typically a "your browser
        // does not support iframes" message — not useful once we've surfaced
        // the canonical video URL.
        const html = `<html><body><p>x</p>
            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"><p>Captions: Hello world</p></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        const content: string = res.body.data.content;
        assert.match(content, /!\[Video \d+\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ\)/);
        assert.doesNotMatch(content, /Captions: Hello world/);
    });

    it('respects retainImages: none for embedded video iframes', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'none', respondWith: 'markdown' });
        assert.doesNotMatch(res.body.data.content, /youtube\.com/);
        assert.doesNotMatch(res.body.data.content, /!\[Video/);
    });

    it('respects retainImages: alt for embedded video iframes', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'alt', respondWith: 'markdown' });
        assert.match(res.body.data.content, /\(Video \d+\)/);
        assert.doesNotMatch(res.body.data.content, /youtube\.com/);
    });

    it('falls back to iframe[href] when src is absent', async () => {
        const html = `<html><body><p>x</p>
            <iframe href="https://www.youtube.com/embed/hrefOnly123"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/www\.youtube\.com\/watch\?v=hrefOnly123\)/);
    });

    it('prefers iframe[src] over iframe[href] when both are present', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="https://www.youtube.com/embed/fromSrc" href="https://www.youtube.com/embed/fromHref"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/www\.youtube\.com\/watch\?v=fromSrc\)/);
        assert.doesNotMatch(res.body.data.content, /fromHref/);
    });

    it('accepts protocol-relative YouTube embeds (//www.youtube.com/embed/...)', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="//www.youtube.com/embed/protoRelative1"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/www\.youtube\.com\/watch\?v=protoRelative1\)/);
    });

    it('accepts protocol-relative Twitch player embeds', async () => {
        const html = `<html><body><p>x</p>
            <iframe src="//player.twitch.tv/?channel=somechannel&parent=example.com"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        // Output URL is always fully-qualified, even when no canonical rewrite exists.
        assert.match(res.body.data.content, /!\[Video \d+\]\(https:\/\/player\.twitch\.tv\/\?channel=somechannel/);
    });

    it('iframe video and <video> share the video counter', async () => {
        const html = `<html><body><p>x</p>
            <video><source src="https://example.com/a.mp4"></video>
            <iframe src="https://www.youtube.com/embed/abc12345DEF"></iframe>
            <p>y</p></body></html>`;
        const res = await crawlHtml(html, { retainImages: 'all', respondWith: 'markdown' });
        const content: string = res.body.data.content;
        assert.match(content, /!\[Video 1\]\(https:\/\/example\.com\/a\.mp4\)/);
        assert.match(content, /!\[Video 2\]\(https:\/\/www\.youtube\.com\/watch\?v=abc12345DEF\)/);
    });
});

describe('multiple media elements get sequential indices', () => {
    it('two videos and one audio interleave their own counters', async () => {
        const res = await crawlHtml(MIXED_HTML, { retainImages: 'all', respondWith: 'markdown' });
        assert.strictEqual(res.status, 200);
        const content: string = res.body.data.content;
        assert.match(content, /!\[Video 1\]\(https:\/\/example\.com\/v1\.mp4\)/);
        assert.match(content, /!\[Audio 1\]\(https:\/\/example\.com\/a1\.mp3\)/);
        assert.match(content, /!\[Video 2\]\(https:\/\/example\.com\/v2\.mp4\)/);
    });
});
