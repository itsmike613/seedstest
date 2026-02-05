// Source/Scripts/inventory/bag.js

import { items } from "../data/items.js";

export class Bag {
    constructor() {
        this.hot = Array.from({ length: 9 }, () => null);
        this.inv = Array.from({ length: 36 }, () => null);
        this.sel = 0;
        this.carry = null;
    }

    add(k, c = 1) {
        const it = items[k];
        if (!it) return c;

        const fill = (arr) => {
            if (it.stack > 1) {
                for (let i = 0; i < arr.length; i++) {
                    const s = arr[i];
                    if (s && s.k === k && s.c < it.stack) {
                        const can = Math.min(it.stack - s.c, c);
                        s.c += can; c -= can;
                        if (c <= 0) return 0;
                    }
                }
            }
            for (let i = 0; i < arr.length; i++) {
                if (!arr[i]) {
                    const put = Math.min(it.stack, c);
                    arr[i] = { k, c: put };
                    c -= put;
                    if (c <= 0) return 0;
                }
            }
            return c;
        };

        c = fill(this.hot);
        if (c > 0) c = fill(this.inv);
        return c;
    }

    moveQuick(i, hot) {
        const a = hot ? this.hot : this.inv;
        const b = hot ? this.inv : this.hot;
        const s = a[i];
        if (!s) return;

        const it = items[s.k];
        if (it.stack > 1) {
            for (let j = 0; j < b.length; j++) {
                const d = b[j];
                if (d && d.k === s.k && d.c < it.stack) {
                    const can = Math.min(it.stack - d.c, s.c);
                    d.c += can; s.c -= can;
                    if (s.c <= 0) { a[i] = null; return; }
                }
            }
        }
        for (let j = 0; j < b.length; j++) {
            if (!b[j]) { b[j] = s; a[i] = null; return; }
        }
    }

    put(i, hot, st) {
        const arr = hot ? this.hot : this.inv;
        const dst = arr[i];
        if (!dst) { arr[i] = st; return null; }

        const it = items[st.k];
        if (dst.k === st.k && it.stack > 1) {
            const can = Math.min(it.stack - dst.c, st.c);
            dst.c += can; st.c -= can;
            if (st.c <= 0) return null;
            return st;
        }
        arr[i] = st;
        return dst;
    }
}