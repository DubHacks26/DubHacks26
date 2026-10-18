import { normalizeProduct } from "./feed.mjs";

const demoProducts = [
  {
    id: 1,
    styles: ['minimalist', 'practical'],
    colors: ['neutral'],
    name: "Studio Pro Headphones",
    brand: "Auraline",
    price: 89,
    category: "Tech",
    rating: 4.8,
    reviews: 1240,
    match: 96,
    image:
      "https://images.unsplash.com/photo-1766338055584-5ffe426a7e57?auto=format&fit=crop&w=1200&q=85",
    description:
      "Immersive sound, cloud-soft cushions, and 40 hours of listening in a warm neutral finish.",
  },
  {
    id: 2,
    styles: ['minimalist', 'aesthetic'],
    colors: ['white', 'neutral'],
    name: "Noma Glow Lamp",
    brand: "Hearth & Form",
    price: 64,
    category: "Home",
    rating: 4.7,
    reviews: 684,
    match: 92,
    image:
      "https://images.unsplash.com/photo-1699979306075-1b4c943a3b16?auto=format&fit=crop&w=1200&q=85",
    description:
      "A sculptural bedside lamp with three warm light settings and a compact linen shade.",
  },
  {
    id: 3,
    styles: ['sustainable', 'practical'],
    colors: ['white'],
    name: "Cloudline Runners",
    brand: "North & Other",
    price: 76,
    category: "Fashion",
    rating: 4.6,
    reviews: 932,
    match: 89,
    image:
      "https://images.unsplash.com/photo-1632761486768-5a50cf7329cf?auto=format&fit=crop&w=1200&q=85",
    description:
      "Everyday trainers made with recycled mesh, a cushioned sole, and easy neutral styling.",
  },
  {
    id: 4,
    styles: ['minimalist', 'budget-friendly'],
    colors: ['pink'],
    name: "Daily Ritual Set",
    brand: "Morrow Skin",
    price: 42,
    category: "Beauty",
    rating: 4.9,
    reviews: 508,
    match: 87,
    image:
      "https://images.unsplash.com/photo-1779117691346-5de09d89a73f?auto=format&fit=crop&w=1200&q=85",
    description:
      "A simple three-step hydration ritual with cleanser, serum, and barrier cream.",
  },
];

// Replace demoProducts with API records using normalizeProduct at this boundary.
export const products = demoProducts.map(normalizeProduct);

export const navItems = [
  { label: "Home", href: "/discover", icon: "compass" },
  { label: "Scroll", href: "/scroll", icon: "scroll" },
  { label: "Collections", href: "/collections", icon: "layers" },
  { label: "Cart", href: "/cart", icon: "cart" },
  { label: "Budget", href: "/budget", icon: "wallet" },
  { label: "Friends", href: "/friends", icon: "users" },
  { label: "Profile", href: "/profile", icon: "user" },
];

export const categoryBreakdown = [
  ["Tech", 42],
  ["Home", 31],
  ["Fashion", 18],
  ["Beauty", 9],
];
