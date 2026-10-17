"use client";

import { useState } from "react";
import Image from "next/image";

export default function ProductImage({ alt = "", src, ...props }) {
  const [failedSource, setFailedSource] = useState(null);
  return <Image alt={alt} height={900} unoptimized width={1200} {...props}
    src={!src || failedSource === src ? "/product-placeholder.svg" : src}
    onError={() => setFailedSource(src)} />;
}
