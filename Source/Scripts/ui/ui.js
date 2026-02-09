// Source/Scripts/ui/ui.js

import { items } from "../data/items.js";

export class UI {
    constructor(rootEl, bag, onSlotDown) {
        this.el = rootEl;
        this.bag = bag;
        this.onSlotDown = onSlotDown;
        this.open = false;
    }

    build() {
        this.el.bar.innerHTML = "";
        for (let i = 0; i < 9; i++) {
            const s = document.createElement("div");
            s.className = "slot";
            this.el.bar.appendChild(s);
        }

        this.el.grid.innerHTML = "";
        const make = (i, hot) => {
            const s = document.createElement("div");
            s.className = "slot";
            s.dataset.i = String(i);
            s.dataset.h = hot ? "1" : "0";
            s.addEventListener("mousedown", (e) => this.onSlotDown(e));
            s.addEventListener("contextmenu", (e) => e.preventDefault());
            return s;
        };

        for (let i = 0; i < 36; i++) this.el.grid.appendChild(make(i, false));
        for (let i = 0; i < 9; i++) {
            const a = make(i, true);
            a.style.marginTop = "10px";
            this.el.grid.appendChild(a);
        }
    }

    setOpen(v) {
        this.open = v;
        this.el.inv.classList.toggle("hide", !this.open);
    }

    paintSlot(el, st) {
        el.innerHTML = "";
        if (!st) return;
        const a = document.createElement("div");
        a.className = "icon";
        a.style.backgroundImage = `url("${items[st.k].img}")`;
        el.appendChild(a);
        const it = items[st.k];
        if (it.stack > 1 && st.c > 1) {
            const n = document.createElement("div");
            n.className = "num";
            n.textContent = String(st.c);
            el.appendChild(n);
        }
    }

    draw() {
        const hs = [...this.el.bar.children];
        for (let i = 0; i < 9; i++) this.paintSlot(hs[i], this.bag.hot[i]);
        this.el.sel.style.transform = `translateX(${(44 + 6) * this.bag.sel}px)`;

        if (this.open) {
            const gs = [...this.el.grid.children];
            for (let i = 0; i < 36; i++) this.paintSlot(gs[i], this.bag.inv[i]);
            for (let i = 0; i < 9; i++) this.paintSlot(gs[36 + i], this.bag.hot[i]);

            if (this.bag.carry) {
                this.el.carry.classList.remove("hide");
                this.el.carry.innerHTML = "";
                const a = document.createElement("div");
                a.className = "slot";
                const b = document.createElement("div");
                b.className = "icon";
                b.style.backgroundImage = `url("${items[this.bag.carry.k].img}")`;
                a.appendChild(b);
                if (items[this.bag.carry.k].stack > 1 && this.bag.carry.c > 1) {
                    const n = document.createElement("div");
                    n.className = "num";
                    n.textContent = String(this.bag.carry.c);
                    a.appendChild(n);
                }
                this.el.carry.appendChild(a);
            } else {
                this.el.carry.classList.add("hide");
            }
        }
    }
}