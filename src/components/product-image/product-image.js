import Image from "next/image";

export default function ProductImage({ alt = "", ...props }) {
  return <Image alt={alt} height={900} unoptimized width={1200} {...props} />;
}
