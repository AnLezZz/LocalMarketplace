import Icon from "./Icon";
import { toggleFavourite } from "../app/favourites/actions";

/** Heart toggle. A form, so it works before the page's JavaScript loads. */
export default function FavouriteButton({ providerId, saved, back, name }: { providerId: string; saved: boolean; back: string; name: string }) {
  return (
    <form action={toggleFavourite.bind(null, providerId, back)}>
      <button className={`fav${saved ? " fav--on" : ""}`} aria-pressed={saved} aria-label={saved ? `Remove ${name} from favourites` : `Save ${name} to favourites`}>
        <Icon name="heart" size={20} />
      </button>
    </form>
  );
}
