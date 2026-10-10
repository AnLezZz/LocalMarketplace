import { requireAdminPage } from "../../../lib/adminGuard";
import { loadCategories, type CategoryRow } from "../../../lib/categories";
import CategoryImageUpload from "../../../components/CategoryImageUpload";
import AdminShell from "../../../components/dashboard/AdminShell";
import IconPicker from "../../../components/dashboard/IconPicker";
import Icon from "../../../components/Icon";
import { addStarterCategories, createCategory, deleteCategory, initCategories, moveCategory, removeCategoryImage, setCategoryEnabled, setCategoryFeatured, updateCategory } from "../actions";

export const dynamic = "force-dynamic";
const back = "/admin/categories";
const LEVEL = ["Category", "Type", "Service"];

type Node = CategoryRow & { kids: Node[] };

function tree(rows: CategoryRow[]): Node[] {
  const by = new Map<string | null, Node[]>();
  for (const r of rows) by.set(r.parentSlug, [...(by.get(r.parentSlug) ?? []), { ...r, kids: [] }]);
  const attach = (n: Node): Node => ({ ...n, kids: (by.get(n.slug) ?? []).map(attach) });
  return (by.get(null) ?? []).map(attach);
}
const count = (n: Node): number => n.kids.reduce((t, k) => t + 1 + count(k), 0);

const Disc = ({ c, size = 44 }: { c: CategoryRow; size?: number }) => (
  <span className={`acat__disc tile--${c.hue}`} style={{ width: size, height: size }}>
    {c.imageUrl ? <img src={c.imageUrl} alt="" /> : <Icon name={c.icon} size={Math.round(size * 0.5)} />}
  </span>
);

/** Everything an admin can do to one category, behind one toggle so a long list stays short. */
function Manage({ c, pos, total }: { c: CategoryRow; pos: number; total: number }) {
  const id = c._id!;
  return (
    <details className="adm-more">
      <summary className="btn btn--secondary btn--sm">Manage…</summary>
      <div className="adm-manage">
        <form action={updateCategory} className="acat__edit">
          <input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} />
          <label className="acat__label">Name<input name="label" defaultValue={c.label} required maxLength={40} /></label>
          <IconPicker idKey={`e-${c.slug.replace(/\W+/g, "-")}`} icon={c.icon} hue={c.hue} />
          <button className="btn btn--primary btn--sm">Save changes</button>
        </form>
        <div className="adm-act">
          <CategoryImageUpload id={id} label={c.imageUrl ? "Replace image" : "Upload image"} />
          {c.imageUrl && <form action={removeCategoryImage.bind(null, id)}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">Remove image</button></form>}
        </div>
        <div className="adm-act">
          <form action={moveCategory.bind(null, id, "up")}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm" disabled={pos === 0} aria-label={`Move ${c.label} up`}>↑ Up</button></form>
          <form action={moveCategory.bind(null, id, "down")}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm" disabled={pos === total - 1} aria-label={`Move ${c.label} down`}>↓ Down</button></form>
          <form action={setCategoryFeatured.bind(null, id, !c.featured)}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">{c.featured ? "Unfeature" : "Feature on homepage"}</button></form>
          <form action={setCategoryEnabled.bind(null, id, !c.enabled)}><input type="hidden" name="back" value={back} /><button className={`btn btn--sm ${c.enabled ? "btn--danger" : "btn--primary"}`}>{c.enabled ? "Disable" : "Enable"}</button></form>
          <form action={deleteCategory.bind(null, id)}><input type="hidden" name="back" value={back} /><button className="btn btn--danger btn--sm" aria-label={`Delete ${c.label}`}>Delete</button></form>
        </div>
      </div>
    </details>
  );
}

const Pills = ({ c }: { c: CategoryRow }) => (
  <>
    {!c.enabled && <span className="pill pill--neutral">Disabled</span>}
    {c.featured && c.depth === 0 && <span className="pill pill--completed">On homepage</span>}
  </>
);

/** A type or service: a compact row, its own children nested under it. */
function Row({ n, pos, total, saved }: { n: Node; pos: number; total: number; saved: boolean }) {
  return (
    <li className="acat__row">
      <div className="acat__rowmain">
        <Disc c={n} size={32} />
        <div className="acat__rowtext">
          <span className="acat__rowname">{n.label} <Pills c={n} /></span>
          <span className="acat__meta">{LEVEL[n.depth] ?? "Service"}{n.kids.length ? ` · ${n.kids.length} inside` : ""}</span>
        </div>
        {saved && n._id && <Manage c={n} pos={pos} total={total} />}
      </div>
      {n.kids.length > 0 && (
        <ul className="acat__list acat__list--nested">
          {n.kids.map((k, i) => <Row key={k.slug} n={k} pos={i} total={n.kids.length} saved={saved} />)}
        </ul>
      )}
    </li>
  );
}

export default async function AdminCategories({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { err, ok } = await searchParams;
  const cats = await loadCategories();
  const mains = tree(cats.all);
  const parents = cats.all.filter((c) => c.depth < 2);
  const types = cats.all.length - mains.length;
  return (
    <AdminShell active="categories" title="Categories" sub="What customers browse and providers choose from. Three levels: category, type, service. Disabling hides a branch from browsing and new choices; providers already in it stay listed." err={err} ok={ok}>
      {!cats.saved && (
        <section className="card d-card">
          <div className="d-card__head"><h2 className="d-card__title">Built-in categories</h2></div>
          <p className="field__hint">These six are in use now. Save them to the database to rename, reorder, disable or add to them.</p>
          <form action={initCategories}><input type="hidden" name="back" value={back} /><button className="btn btn--primary btn--sm">Save categories to edit them</button></form>
        </section>
      )}

      {cats.saved && (
        <section className="card d-card acat__bar" aria-label="Add categories">
          <div className="acat__count"><strong className="num">{mains.length}</strong> categories · <strong className="num">{types}</strong> types and services</div>
          <div className="adm-act">
            <details className="adm-more acat__add">
              <summary className="btn btn--primary btn--sm">+ Add a category</summary>
              <form action={createCategory} className="adm-manage acat__edit">
                <input type="hidden" name="back" value={back} />
                <label className="acat__label">Name<input name="label" required maxLength={40} placeholder="e.g. Roofing" /></label>
                <label className="acat__label">Where it goes
                  <select name="parentId" defaultValue="">
                    <option value="">A main category</option>
                    {parents.map((c) => <option key={c.slug} value={c._id ?? ""}>{"– ".repeat(c.depth)}Inside {c.label}</option>)}
                  </select>
                </label>
                <IconPicker idKey="new" />
                <label className="adm-check"><input type="checkbox" name="featured" /> Show on the homepage</label>
                <button className="btn btn--primary btn--sm">Add</button>
              </form>
            </details>
            <form action={addStarterCategories}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">Add starter categories</button></form>
          </div>
        </section>
      )}

      <div className="acat__grid">
        {mains.map((m, i) => (
          <section key={m.slug} className="card acat" aria-labelledby={`m-${m.slug.replace(/\W+/g, "-")}`}>
            <div className="acat__head">
              <Disc c={m} size={52} />
              <div className="acat__titles">
                <h2 id={`m-${m.slug.replace(/\W+/g, "-")}`} className="acat__name">{m.label} <Pills c={m} /></h2>
                <span className="acat__meta">{m.kids.length ? `${m.kids.length} types · ${count(m)} in all` : "No types yet"} · key <code>{m.slug}</code></span>
              </div>
              {cats.saved && m._id && <Manage c={m} pos={i} total={mains.length} />}
            </div>
            {m.kids.length > 0 && (
              <details className="acat__kids" open={mains.length <= 3}>
                <summary>{m.kids.length} types</summary>
                <ul className="acat__list">
                  {m.kids.map((k, j) => <Row key={k.slug} n={k} pos={j} total={m.kids.length} saved={cats.saved} />)}
                </ul>
              </details>
            )}
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
