// A window's questions (M5 W8, AB-T-0593): a sheet over the page that asks one thing and waits for the answer. One at a
// time. A second question while one is up is answered "cancel" at once and never shown, so the first keeps its sheet
// and its answer: every `ask` resolves. (Two resolvers and one sheet was how a close could hang: New Short asked over
// the close's sheet, the close's promise was dropped, and the shell waited for an answer that could never come.)

/**
 * @param {(question: null | { title: string, text: string, options: { id: string, label: string }[] }) => void} show
 *   called with the question to show, and with null when it has been answered
 * @returns {{ ask: (title: string, text: string, options: { id: string, label: string }[]) => Promise<string>, reply: (id: string) => void, readonly asking: boolean }}
 *   ask → the chosen option's id ("cancel" when another question was already up); reply: the person's choice
 */
export function questions(show) {
  let open = null;
  return {
    get asking() { return !!open; },
    ask(title, text, options) {
      if (open) return Promise.resolve('cancel');
      return new Promise((resolve) => { open = resolve; show({ title, text, options }); });
    },
    reply(id) {
      const resolve = open;
      if (!resolve) return;
      open = null; show(null);
      resolve(id);
    },
  };
}
