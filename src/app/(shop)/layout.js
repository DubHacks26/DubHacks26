import ShopTabRoute from "@/components/shop-tab-route/shop-tab-route";

// Keep session, profile, and catalog state alive across shop navigation.
export default function ShopLayout({ children }) {
  return <>
    <ShopTabRoute />
    {children}
  </>;
}
