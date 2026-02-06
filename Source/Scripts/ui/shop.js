// Source/Scripts/ui/shop.js

import { items } from "../data/items.js";

export class Shop {
    constructor(rootEl, bag, msgFn) {
        this.el = rootEl;
        this.bag = bag;
        this.msg = msgFn;

        this.open = false;
        this.coins = 0;

        this.stock = [
            { k: "seed_raspberry", price: 8 },
            { k: "seed_blueberry", price: 10 },
        ];

        this._boundEsc = (e) => {
            if (!this.open) return;
            if (e.code !== "Escape") return;
            e.preventDefault();
            this.setOpen(false);
        };
    }

    build() {
        this.el.shopList.innerHTML = "";

        for (const s of this.stock) {
            const row = document.createElement("div");
            row.className = "shopRow";

            const icon = document.createElement("div");
            icon.className = "shopIcon";
            icon.style.backgroundImage = `url("${items[s.k].img}")`;

            const meta = document.createElement("div");
            meta.className = "shopMeta";

            const name = document.createElement("div");
            name.className = "shopName";
            name.textContent = items[s.k].n;

            const price = document.createElement("div");
            price.className = "shopPrice";
            price.textContent = `${s.price} coins`;

            meta.appendChild(name);
            meta.appendChild(price);

            const buy = document.createElement("button");
            buy.className = "shopBuy";
            buy.textContent = "Buy";

            const doBuy = () => this.buy(s.k, s.price);

            buy.addEventListener("click", (e) => {
                e.preventDefault();
                doBuy();
            });

            row.addEventListener("click", (e) => {
                if (e.target === buy) return;
                doBuy();
            });

            row.appendChild(icon);
            row.appendChild(meta);
            row.appendChild(buy);

            this.el.shopList.appendChild(row);
        }
    }

    setCoins(v) {
        this.coins = Math.max(0, Math.floor(v));
        this._drawCoins();
    }

    _drawCoins() {
        this.el.shopCoins.textContent = `Coins: ${this.coins}`;
    }

    setOpen(v) {
        this.open = v;
        this.el.shop.classList.toggle("hide", !this.open);

        if (this.open) {
            this._drawCoins();
            window.addEventListener("keydown", this._boundEsc, { capture: true });
        } else {
            window.removeEventListener("keydown", this._boundEsc, { capture: true });
        }
    }

    buy(k, price) {
        if (!this.open) return;

        if (this.coins < price) {
            this.msg("Not enough coins");
            return;
        }

        const left = this.bag.add(k, 1);
        if (left > 0) {
            this.msg("Bag full");
            return;
        }

        this.coins -= price;
        this._drawCoins();
    }
}
