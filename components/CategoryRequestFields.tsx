import { indented, type CategoryRow } from "../lib/categories";

/**
 * The three things a category request asks for. Plain form fields, so the same block sits inside the application form and in the
 * stand-alone request form on the tracking page. Names are prefixed `request` and read by the server actions.
 */
export default function CategoryRequestFields({ parents, idKey }: { parents: CategoryRow[]; idKey: string }) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${idKey}-name`} className="field__label">Category or service name</label>
        <input id={`${idKey}-name`} name="requestName" maxLength={40} placeholder="e.g. Window tinting" />
      </div>
      <div className="field">
        <label htmlFor={`${idKey}-desc`} className="field__label">Describe the service you offer</label>
        <textarea id={`${idKey}-desc`} name="requestDescription" rows={3} maxLength={500} placeholder="What do you do, and who is it for?" />
      </div>
      <div className="field">
        <label htmlFor={`${idKey}-parent`} className="field__label">Where would it fit best? (optional)</label>
        <select id={`${idKey}-parent`} name="requestParent" defaultValue="">
          <option value="">Not sure</option>
          {parents.map((c) => <option key={c.slug} value={c.slug}>{indented(c)}</option>)}
        </select>
      </div>
    </>
  );
}
