// What the spike draws. Original text (the sample project's café, Mira and Hana); every scene is laid out in pixels
// of the target size, y up, from a 3840×2160 design scaled by k = height / 2160.

export const TITLE = {
  main: '第一話　はじまりの喫茶店',
  sub: 'Episode 1 — The Café Where It Began',
  cap: 'ミラ「いらっしゃいませ！ご注文は？」',
  capEn: 'Mira: “Welcome in! What can I get you?”',
};

/** The 4K title card: a big Japanese title, an English subtitle, and a burned-in caption over a translucent box. */
export function titleItems(w, h) {
  const k = h / 2160;
  return {
    boxes: [{ x: w / 2, y: 280 * k, w: 2600 * k, h: 300 * k, color: 0x000000, opacity: 0.55 }],
    items: [
      { str: TITLE.main, size: 230 * k, x: w / 2, y: h * 0.6, color: 0xffffff },
      { str: TITLE.sub, size: 96 * k, x: w / 2, y: h * 0.6 - 210 * k, color: 0xf2c46d },
      { str: TITLE.cap, size: 76 * k, x: w / 2, y: 330 * k, color: 0xffffff },
      { str: TITLE.capEn, size: 64 * k, x: w / 2, y: 200 * k, color: 0xffffff },
    ],
  };
}

/** Two glyphs that fill the frame: the per-pixel worst case. */
export function fillItems(w, h) {
  return { boxes: [], items: [{ str: '喫茶', size: h * 0.9, x: w / 2, y: h * 0.14, color: 0xffffff }] };
}

const PARA = 'ミラは朝いちばんに喫茶店の扉を開けて、窓ぎわの席に陽が差すのを待った。ハナはカウンターの奥でコーヒー豆を挽きながら、今日の特製ケーキについて話しはじめる。「苺のタルトと、抹茶のロールケーキ。どちらにする？」常連の客が来るまでには、まだ少し時間がある。二人は黒板に新しいメニューを書き、花瓶の水を替え、古いレコードをかけた。雨の日も晴れの日も、この店はいつも同じ匂いがする。焼きたてのパンと、深煎りの豆と、少しだけ古い木の床の匂い。';

/** 2,000 glyphs: 40 lines of 50 (no spaces, so every character is a drawn glyph), subtitle-sized at 1080p. */
export function denseItems(w, h, lines = 40, perLine = 50) {
  const k = h / 1080;
  const chars = [...PARA];
  const items = [];
  let c = 0;
  for (let i = 0; i < lines; i++) {
    let s = '';
    for (let j = 0; j < perLine; j++) s += chars[c++ % chars.length];
    items.push({ str: s, size: 22 * k, x: w / 2, y: h - 40 * k - i * 25.6 * k, color: 0xffffff });
  }
  return { boxes: [], items };
}

/** A jōyō-sized character set: printable ASCII, CJK punctuation, kana, then CJK ideographs in code-point order (not by frequency) up to `total`. */
export function charSet(cmap, total = 3000) {
  const out = [];
  const add = (a, b) => { for (let c = a; c <= b && out.length < total; c++) if (cmap.has(c)) out.push(c); };
  add(0x21, 0x7e); add(0x3000, 0x303f); add(0x3041, 0x3096); add(0x30a1, 0x30fa); add(0xff01, 0xff5e); add(0x4e00, 0x9fff);
  return out;
}
