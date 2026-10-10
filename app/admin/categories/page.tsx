import { requireAdminPage } from "../../../lib/adminGuard";
import { CATEGORY_HUES, CATEGORY_ICONS, loadCategories } from "../../../lib/categories";
import CategoryImageUpload from "../../../components/CategoryImageUpload";
import AdminShell from "../../../components/dashboard/AdminShell";
import Icon from "../../../components/Icon";
import { addCategoryExamples, createCategory, deleteCategory, initCategories, moveCategory, removeCategoryImage, setCategoryEnabled, setCategoryFeatured, updateCategory } from "../actions";

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
          {cats.all.map((c, i) => {
            const sibs = cats.all.filter((x) => x.parentSlug === c.parentSlug);
            const pos = sibs.findIndex((x) => x.slug === c.slug);
            const level = ["Main category", "Subcategory", "Service"][c.depth] ?? "Service";
            return (
              <li key={c.slug} className="adm-row" style={{ marginLeft: c.depth * 20 }}>
                <div className="adm-row__main">
                  <strong>
                    <span className={`cat-dot cat-dot--${c.hue}`}>{c.imageUrl ? <img src={c.imageUrl} alt="" width={16} height={16} style={{ borderRadius: "50%", objectFit: "cover" }} /> : <Icon name={c.icon} size={16} />}</span> {c.label}{" "}
                    <span className={`pill pill--${c.enabled ? "completed" : "neutral"}`}>{c.enabled ? "Enabled" : "Disabled"}</span>{" "}
                    {c.featured && <span className="pill pill--completed">Featured</span>}
                  </strong>
                  <span>{level} · key <code>{c.slug}</code></span>
                  {cats.saved && c._id && (
                    <details className="adm-more"><summary className="btn btn--secondary btn--sm">Manage…</summary>
                      <div className="adm-manage">
                        <form action={updateCategory} className="adm-act"><input type="hidden" name="id" value={c._id} /><input type="hidden" name="back" value={back} />
                          <input name="label" defaultValue={c.label} required maxLength={40} aria-label={`Name for ${c.label}`} /><Pickers icon={c.icon} hue={c.hue} />
                          <button className="btn btn--secondary btn--sm">Save</button></form>
                        <div className="adm-act">
                          <CategoryImageUpload id={c._id} label={c.imageUrl ? "Replace image" : "Upload image"} />
                          {c.imageUrl && <form action={removeCategoryImage.bind(null, c._id)}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">Remove image</button></form>}
                        </div>
                        <div className="adm-act">
                          <form action={moveCategory.bind(null, c._id, "up")}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm" disabled={pos === 0} aria-label={`Move ${c.label} up`}>↑ Up</button></form>
                          <form action={moveCategory.bind(null, c._id, "down")}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm" disabled={pos === sibs.length - 1} aria-label={`Move ${c.label} down`}>↓ Down</button></form>
                          <form action={setCategoryFeatured.bind(null, c._id, !c.featured)}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">{c.featured ? "Unfeature" : "Feature"}</button></form>
                          <form action={setCategoryEnabled.bind(null, c._id, !c.enabled)}><input type="hidden" name="back" value={back} /><button className={`btn btn--sm ${c.enabled ? "btn--danger" : "btn--primary"}`}>{c.enabled ? "Disable" : "Enable"}</button></form>
                          <form action={deleteCategory.bind(null, c._id)}><input type="hidden" name="back" value={back} /><button className="btn btn--danger btn--sm" aria-label={`Delete ${c.label}`}>Delete</button></form>
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {cats.saved && (
        <section className="card d-card" aria-labelledby="add-h">
          <div className="d-card__head"><h2 id="add-h" className="d-card__title">Add a category</h2></div>
          <form action={createCategory} className="adm-act"><input type="hidden" name="back" value={back} />
            <input name="label" required maxLength={40} placeholder="e.g. Roofing" aria-label="Category name" />
            <select name="parentId" aria-label="Where it goes" defaultValue="">
              <option value="">Main category</option>
              {cats.all.filter((c) => c.depth < 2).map((c) => <option key={c.slug} value={c._id ?? ""}>{"– ".repeat(c.depth)}Under {c.label}</option>)}
            </select>
            <Pickers />
            <label className="adm-check"><input type="checkbox" name="featured" /> Show on homepage</label>
            <button className="btn btn--primary btn--sm">Add</button></form>
          <p className="field__hint">Three levels: category, subcategory, service. A category can be deleted only when nothing is inside it and no provider uses it; otherwise disable it, so providers never lose theirs.</p>
          <form action={addCategoryExamples} className="adm-act"><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">Add example categories</button><span className="field__hint">Beauty &amp; Wellness, Home Services and Child &amp; Family with their subcategories. Skips any already there.</span></form>
        </section>
      )}
    </AdminShell>
  );
}
