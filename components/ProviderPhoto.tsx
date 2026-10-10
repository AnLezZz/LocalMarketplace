import Image from "next/image";
import Avatar from "./Avatar";
import { providerFallbackPhoto } from "./providerFallbackPhoto";

/** The provider's photo when they have one, otherwise a stand-in for their category (when `category` is given and has one), otherwise the initials disc. `fill` stretches to the parent (which must be positioned). */
export default function ProviderPhoto({ name, photo: own, category, size = 96, fill = false, rounded = 14 }: { name: string; photo?: string; category?: string; size?: number; fill?: boolean; rounded?: number }) {
  const photo = own ?? providerFallbackPhoto(category);
  if (!photo) return fill ? <Avatar name={name} size={72} /> : <Avatar name={name} size={size} square />;
  if (fill) return <Image src={photo} alt={name} fill sizes="260px" style={{ objectFit: "cover", objectPosition: "50% 25%" }} />;
  return <Image src={photo} alt={name} width={size} height={size} style={{ width: size, height: size, borderRadius: rounded, objectFit: "cover", objectPosition: "50% 25%", flex: "none" }} />;
}
