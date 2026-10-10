import type { CategoryRow } from "../lib/categories";
import { indented } from "../lib/categories";

/**
 * A provider's categories: one primary (the headline on their profile) and any number of others they offer,
 * across main categories, subcategories and services. Plain form fields (`category`, repeated `more`), so it works without JavaScript.
 */
export default function CategoryPicker({ rows, primary, more = [] }: { rows: CategoryRow[]; primary?: string; more?: string[] }) {
  const chosen = new Set([primary, ...more]);
  // Usable categories, plus ones the provider already has that have since been switched off.
  const shown = rows.filter((c) => c.active || chosen.has(c.slug));
  return (
    <>
      <div className="field field--grow">
        <label htmlFor="category" className="field__label">Main category</label>
        <select id="category" name="category" defaultValue={primary ?? ""} required>
          <option value="" disabled>Choose a category</option>
          {shown.map((c) => <option key={c.slug} value={c.slug}>{indented(c)}</option>)}
        </select>
      </div>
      <fieldset className="catpick">
        <legend className="field__label">Also offer (tick everything that applies)</legend>
        <div className="catpick__list">
          {shown.map((c) => (
            <label key={c.slug} className="catpick__item" style={{ paddingLeft: `${c.depth * 20}px` }}>
              <input type="checkbox" name="more" value={c.slug} defaultChecked={more.includes(c.slug)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
