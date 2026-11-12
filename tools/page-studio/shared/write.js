/*
 * How a view writes to the page, shared by every view (Block, Button, Section, and the next one):
 *
 *   pauseTimer()       a change waits for a pause before it is written (picks PICK_MS, typing TYPE_MS)
 *   sendInBlock()      a write into a block: DA checks that the cursor is still in it and the page
 *                      unchanged (`expected`); when the page changed meanwhile (STALE_LIVE), once
 *                      more on the newer page
 *   replaceAtCursor()  a write of the node at the cursor (a paragraph, a settings table: no block,
 *                      so no `expected`), then the page after it
 *
 * What to put back when a write took the wrong node stays with each view (it knows what it wrote).
 * DA's own time limit on a write is shared/da.js trackCursor().
 */

export const PICK_MS = 350; // a pick changes the page after this pause
export const TYPE_MS = 800; // typing changes the page after this pause

/**
 * The pause before a write.
 * @param {function()} write called once the pause is over
 * @returns {{start: function(boolean), stop: function(), done: function(), waiting: boolean}}
 *   start(typing) (re)starts the pause; stop() cancels it; done() is called by the write when it
 *   starts (a write run directly drops the pause's handle, as a running write takes the latest form)
 */
export function pauseTimer(write) {
  let timer = null;
  return {
    start(typing) {
      clearTimeout(timer);
      timer = setTimeout(write, typing ? TYPE_MS : PICK_MS);
    },
    stop() {
      clearTimeout(timer);
      timer = null;
    },
    done() {
      timer = null;
    },
    get waiting() {
      return timer !== null;
    },
  };
}

/**
 * A write into the block at `blockIndex`.
 * @param {Object} o
 * @param {Object} o.actions the SDK actions (shared/da.js trackCursor())
 * @param {number} o.blockIndex the block the cursor must still be in
 * @param {function(): (string|null)} o.html what to write, made from the page as it is now
 *   (null: nothing to write any more, answered as `{ ok: false, error: 'gone' }`)
 * @param {function(): string} o.live the live document now
 * @param {function(string)} o.setLive takes a newer live document as the view's
 * @param {function(string, number): Promise<string|null>} o.next waits for a live document other
 *   than the one given (shared/da.js liveWaiter().next)
 * @param {function(string|null): (boolean|Promise<boolean>)} [o.takeNewer] after STALE_LIVE: takes
 *   the newer page (null when none came), true to write once more; by default setLive() it
 * @returns {Promise<Object>} DA's answer
 */
export async function sendInBlock({
  actions, blockIndex, html, live, setLive, next, takeNewer,
}) {
  let sent = '';
  const send = () => {
    const body = html();
    if (body === null) return { ok: false, error: 'gone' };
    sent = live();
    return actions.sendHTML(body, { replace: true, expected: { html: sent, blockIndex } });
  };
  let result = await send();
  if (!result?.ok && result?.error === 'STALE_LIVE') {
    // the author typed in the page meanwhile: the newer page may be here already (it came while
    // DA answered), else wait for it
    const newer = live() !== sent ? live() : await next(sent, 1500);
    let again = Boolean(newer);
    if (takeNewer) again = await takeNewer(newer);
    else if (newer) setLive(newer);
    if (again) result = await send();
  }
  if (result?.ok && result.html) setLive(result.html);
  return result;
}

/**
 * Replaces the top-level node at the cursor and reads the page after it: DA's answer, else its
 * next live document (within `ms`), else `fallback`.
 * @returns {Promise<{result: Object, after: string|null}>} after: null when DA refused
 */
export async function replaceAtCursor({
  actions, html, before, next, ms = 3000, fallback = before,
}) {
  const result = await actions.sendHTML(html, { replace: true });
  if (!result?.ok) return { result, after: null };
  const after = result.html || (await next(before, ms)) || fallback;
  return { result, after };
}
