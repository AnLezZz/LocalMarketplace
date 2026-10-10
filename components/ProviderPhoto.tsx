import Image from "next/image";
import Avatar from "./Avatar";

/** The provider's photo when they have one, otherwise the initials disc. `fill` stretches to the parent (which must be positioned). */
export default function ProviderPhoto({ name, photo, size = 96, fill = false, rounded = 14 }: { name: string; photo?: string; size?: number; fill?: boolean; rounded?: number }) {
  if (!photo) return fill ? <Avatar name={name} size={72} /> : <Avatar name={name} size={size} square />;
  if (fill) return <Image src={photo} alt={name} fill sizes="260px" style={{ objectFit: "cover", objectPosition: "50% 25%" }} />;
  return <Image src={photo} alt={name} width={size} height={size} style={{ width: size, height: size, borderRadius: rounded, objectFit: "cover", objectPosition: "50% 25%", flex: "none" }} />;
}
