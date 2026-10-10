import { requireAdminPage } from "../../../lib/adminGuard";
import { CATEGORY_HUES, CATEGORY_ICONS, loadCategories } from "../../../lib/categories";
import AdminShell from "../../../components/dashboard/AdminShell";
import Icon from "../../../components/Icon";
import { createCategory, initCategories, moveCategory, setCategoryEnabled, updateCategory } from "../actions";

export const dynamic = "force-dynamic";
const ICON_LABEL: Record<string, string> = { cleaning: "Spray bottle", gardening: "Plant", handyman: "Wrench", petCare: "Paw", car: "Car", moving: "Box", home: "House", leaf: "Leaf", tag: "Tag", briefcase: "Briefcase", star: "Star", heart: "Heart" };
const HUE_LABEL: Record<string, string> = { cleaning: "Mint", gardening: "Green", handyman: "Amber", petcare: "Rose", car: "Sky", moving: "Violet", neutral: "Neutral" };

const Pickers = ({ icon, hue }: { icon?: string; hue?: string }) => (
  <>
    <select name="icon" defaultValue={icon ?? "tag"} aria-label="Icon">{CATEGORY_ICONS.map((i) => <option key={i} value={i}>{ICON_LABEL[i] ?? i}</option>)}</select>
    <select name="hue" defaultValue={hue ?? "neutral"} aria-label="Colour">{CATEGORY_HUES.map((h) => <option key={h} value={h}>{HUE_LABEL[h] ?? h}</option>)}</select>
  </>
);

export default async function AdminCategories({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { err, ok } = await searchParams;
  const cats = await loadCategories();
  const back = "/admin/categories";
  return (
    <AdminShell active="categories" title="Categories" sub="What customers browse and providers choose from. Disabling hides a category from browsing and from new choices; providers already in it stay listed." err={err} ok={ok}>
      {!cats.saved && (
        <section className="card d-card">
          <div className="d-card__head"><h2 className="d-card__title">Built-in categories</h2></div>
          <p className="field__hint">These six are in use now. Save them to the database to rename, reorder, disable or add to them.</p>
          <form action={initCategories}><input type="hidden" name="back" value={back} /><button className="btn btn--primary btn--sm">Save categories to edit them</button></form>
        </section>
      )}
      <section className="card d-card" aria-labelledby="cl-h">
        <div className="d-card__head"><h2 id="cl-h" className="d-card__title">All categories</h2><span className="d-card__sub num">{cats.all.length}</span></div>
        <ul className="adm-list">
          {cats.all.map((c, i) => (
            <li key={c.slug} className="adm-row">
              <div className="adm-row__main">
                <strong><span className={`cat-dot cat-dot--${c.hue}`}><Icon name={c.icon} size={16} /></span> {c.label} <span className={`pill pill--${c.enabled ? "completed" : "neutral"}`}>{c.enabled ? "Enabled" : "Disabled"}</span></strong>
                <span>Key <code>{c.slug}</code> (what providers store)</span>
                {cats.saved && (
                  <details className="rv__report"><summary>Edit</summary>
                    <form action={updateCategory} className="adm-act"><input type="hidden" name="id" value={c._id ?? ""} /><input type="hidden" name="back" value={back} />
                      <input name="label" defaultValue={c.label} required maxLength={40} aria-label={`Name for ${c.label}`} /><Pickers icon={c.icon} hue={c.hue} />
                      <button className="btn btn--secondary btn--sm">Save</button></form>
                  </details>
                )}
              </div>
              {cats.saved && c._id && (
                <div className="adm-act">
                  <form action={moveCategory.bind(null, c._id, "up")}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm" disabled={i === 0} aria-label={`Move ${c.label} up`}>↑</button></form>
                  <form action={moveCategory.bind(null, c._id, "down")}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm" disabled={i === cats.all.length - 1} aria-label={`Move ${c.label} down`}>↓</button></form>
                  <form action={setCategoryEnabled.bind(null, c._id, !c.enabled)}><input type="hidden" name="back" value={back} /><button className={`btn btn--sm ${c.enabled ? "btn--danger" : "btn--primary"}`}>{c.enabled ? "Disable" : "Enable"}</button></form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      {cats.saved && (
        <section className="card d-card" aria-labelledby="add-h">
          <div className="d-card__head"><h2 id="add-h" className="d-card__title">Add a category</h2></div>
          <form action={createCategory} className="adm-act"><input type="hidden" name="back" value={back} />
            <input name="label" required maxLength={40} placeholder="e.g. Roofing" aria-label="Category name" /><Pickers />
            <button className="btn btn--primary btn--sm">Add category</button></form>
          <p className="field__hint">Up to 20 categories. Names can&apos;t be deleted, only disabled, so providers never lose their category.</p>
        </section>
      )}
    </AdminShell>
  );
}
