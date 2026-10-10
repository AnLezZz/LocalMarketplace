/** Suburb suggestions for inputs with list="suburb-options". Empty when the marketplace is not restricted to a list. */
export default function SuburbOptions({ suburbs }: { suburbs: string[] }) {
  if (suburbs.length === 0) return null;
  return <datalist id="suburb-options">{suburbs.map((s) => <option key={s} value={s} />)}</datalist>;
}
