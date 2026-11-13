import { getStore } from "@netlify/blobs";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const config = { path: "/api/*" };

const db = () => getStore("rahmah");
const im = () => getStore("images");
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const PW = () => Netlify.env.get("ADMIN_PASSWORD");
const sign = (e) => createHmac("sha256", PW() + "|rahmah").update(String(e)).digest("hex");
const mk = () => { const e = Date.now() + 7 * 864e5; return e + "." + sign(e); };
const authed = (req) => {
  const t = (req.headers.get("x-token") || "").split(".");
  if (t.length !== 2 || !PW() || Number(t[0]) < Date.now()) return false;
  const a = Buffer.from(sign(t[0])), b = Buffer.from(t[1]);
  return a.length === b.length && timingSafeEqual(a, b);
};

const CATS = [
  { id: "muslima", name: "মুসলিমা সেট বোরকা", icon: "👗" },
  { id: "premium", name: "প্রিমিয়াম বোরকা", icon: "✨" },
  { id: "simple", name: "সিম্পল বোরকা", icon: "🖤" },
  { id: "hijab", name: "হিজাব", icon: "🧕" },
  { id: "niqab", name: "নিকাব", icon: "🎭" },
  { id: "new", name: "নতুন কালেকশন", icon: "🆕" },
];
const mkS = (id, name, cat, price, disc, colors) => ({ id, name, cat, price, disc, stock: 20, sizes: ["৫২", "৫৪", "৫৬", "৫৮"], colors, images: [], desc: "প্রিমিয়াম ফেব্রিক, আরামদায়ক ও মার্জিত ডিজাইন। (নমুনা পণ্য)", sample: true });
const SEED = [
  mkS("s1", "এমব্রয়ডারি মুসলিমা সেট বোরকা", "muslima", 3200, 15, ["কালো", "মেরুন"]),
  mkS("s2", "প্রিমিয়াম নিদা বোরকা", "premium", 2800, 10, ["কালো", "প্লাম"]),
  mkS("s3", "সিম্পল কালো বোরকা", "simple", 1500, 0, ["কালো"]),
  mkS("s4", "জর্জেট হিজাব", "hijab", 450, 5, ["কালো", "রোজ", "ক্রিম"]),
  mkS("s5", "প্রিমিয়াম নিকাব", "niqab", 350, 0, ["কালো"]),
  mkS("s6", "নতুন ফুল স্লিভ বোরকা", "new", 2400, 20, ["মেরুন", "কালো"]),
];
const DS = { bkash: "01727948272", nagad: "01727948272", whatsapp: "8801737588395", delivery: { in: 80, out: 130 } };

export default async (req) => {
  const u = new URL(req.url), p = u.pathname.replace(/^\/api\/?/, ""), m = req.method;
  try {
    if (p === "data") {
      const products = (await db().get("products", { type: "json" })) || SEED;
      const categories = (await db().get("categories", { type: "json" })) || CATS;
      const s = (await db().get("settings", { type: "json" })) || {};
      return J({ products, categories, settings: { ...DS, ...s, delivery: { ...DS.delivery, ...(s.delivery || {}) } } });
    }
    if (p.startsWith("img/")) {
      const id = p.slice(4);
      if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("", { status: 404 });
      const b = await im().get(id, { type: "arrayBuffer" });
      if (!b) return new Response("", { status: 404 });
      return new Response(b, { headers: { "content-type": "image/jpeg", "cache-control": "public,max-age=31536000,immutable" } });
    }
    if (p === "login" && m === "POST") {
      const { password } = await req.json();
      if (!PW()) return J({ error: "Netlify-তে ADMIN_PASSWORD সেট করা হয়নি" }, 500);
      if (password !== PW()) return J({ error: "পাসওয়ার্ড ভুল" }, 401);
      return J({ token: mk() });
    }
    if (p === "order" && m === "POST") {
      const o = await req.json();
      if (!o.name || !/^01\d{9}$/.test(o.phone || "") || !o.address || !Array.isArray(o.items) || !o.items.length) return J({ error: "তথ্য অসম্পূর্ণ" }, 400);
      const products = (await db().get("products", { type: "json" })) || SEED;
      const s = (await db().get("settings", { type: "json" })) || {};
      const del = { ...DS.delivery, ...(s.delivery || {}) };
      let sub = 0; const items = [];
      for (const i of o.items.slice(0, 50)) {
        const pr = products.find((x) => x.id === i.pid); if (!pr) continue;
        const q = Math.max(1, Math.min(99, parseInt(i.qty) || 1));
        const price = Math.round(pr.price * (1 - (pr.disc || 0) / 100));
        sub += price * q; items.push({ name: pr.name, size: String(i.size || ""), color: String(i.color || ""), qty: q, price });
      }
      if (!items.length) return J({ error: "পণ্য পাওয়া যায়নি" }, 400);
      const delivery = o.district === "ঢাকা" ? del.in : del.out;
      const pay = ["bkash", "nagad", "cod"].includes(o.pay) ? o.pay : "cod";
      const rec = { id: "RF" + Date.now().toString(36).toUpperCase(), at: new Date().toISOString(), status: "নতুন", name: String(o.name).slice(0, 80), phone: o.phone, address: String(o.address).slice(0, 300), district: String(o.district || "").slice(0, 40), upazila: String(o.upazila || "").slice(0, 60), pay, trx: String(o.trx || "").slice(0, 40), items, sub, delivery, total: sub + delivery };
      const list = (await db().get("orders", { type: "json" })) || [];
      list.unshift(rec);
      await db().setJSON("orders", list.slice(0, 1000));
      return J({ ok: true, order: rec });
    }
    // ---- admin only ----
    if (!authed(req)) return J({ error: "অনুমতি নেই" }, 401);
    if (p === "save" && m === "POST") {
      const { key, value } = await req.json();
      if (!["products", "categories", "settings"].includes(key)) return J({ error: "bad key" }, 400);
      await db().setJSON(key, value);
      return J({ ok: true });
    }
    if (p === "upload" && m === "POST") {
      const { data } = await req.json();
      const mt = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data || "");
      if (!mt) return J({ error: "ছবি সঠিক নয়" }, 400);
      const buf = Buffer.from(mt[2], "base64");
      if (buf.length > 4e6) return J({ error: "ছবি বেশি বড়" }, 400);
      const id = randomUUID();
      await im().set(id, new Blob([buf]));
      return J({ url: "/api/img/" + id });
    }
    if (p === "orders") return J((await db().get("orders", { type: "json" })) || []);
    if (p === "order-update" && m === "POST") {
      const { id, status, del } = await req.json();
      let list = (await db().get("orders", { type: "json" })) || [];
      list = del ? list.filter((o) => o.id !== id) : list.map((o) => (o.id === id ? { ...o, status } : o));
      await db().setJSON("orders", list);
      return J({ ok: true });
    }
    return J({ error: "not found" }, 404);
  } catch (e) {
    return J({ error: "সার্ভার ত্রুটি: " + e.message }, 500);
  }
};
