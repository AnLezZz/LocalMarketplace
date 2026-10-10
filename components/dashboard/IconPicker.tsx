import Icon, { type IconName } from "../Icon";
import { CATEGORY_HUES, CATEGORY_ICONS } from "../../lib/categories";

const ICON_LABEL: Record<string, string> = { cleaning: "Spray bottle", gardening: "Plant", handyman: "Wrench", petCare: "Paw", car: "Car", moving: "Box", home: "House", leaf: "Leaf", tag: "Tag", briefcase: "Briefcase", star: "Star", heart: "Heart", scissors: "Scissors", spa: "Spa", smile: "Smile", book: "Book", droplet: "Droplet", bolt: "Bolt", paint: "Paint roller", window: "Window", tree: "Tree", truck: "Truck", sparkles: "Sparkles" };
const HUE_LABEL: Record<string, string> = { cleaning: "Mint", gardening: "Green", handyman: "Amber", petcare: "Rose", car: "Sky", moving: "Violet", neutral: "Grey" };

/**
 * Icon and colour as pictures you can see and tap (radio buttons underneath, so it works with a keyboard and without JavaScript).
 * `idKey` keeps the radio groups of different forms on one page apart.
 */
export default function IconPicker({ idKey, icon, hue }: { idKey: string; icon?: string; hue?: string }) {
  return (
    <div className="ipick">
      <fieldset className="ipick__group">
        <legend className="ipick__legend">Icon</legend>
        <div className="ipick__icons">
          {CATEGORY_ICONS.map((i) => (
            <label key={i} className="ipick__opt" title={ICON_LABEL[i] ?? i}>
              <input type="radio" name="icon" value={i} defaultChecked={(icon ?? "tag") === i} id={`${idKey}-i-${i}`} />
              <span className="ipick__face"><Icon name={i as IconName} size={22} /></span>
              <span className="sr-only">{ICON_LABEL[i] ?? i}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="ipick__group">
        <legend className="ipick__legend">Colour</legend>
        <div className="ipick__hues">
          {CATEGORY_HUES.map((h) => (
            <label key={h} className="ipick__opt" title={HUE_LABEL[h] ?? h}>
              <input type="radio" name="hue" value={h} defaultChecked={(hue ?? "neutral") === h} id={`${idKey}-h-${h}`} />
              <span className={`ipick__face ipick__face--hue tile--${h}`} />
              <span className="sr-only">{HUE_LABEL[h] ?? h}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
