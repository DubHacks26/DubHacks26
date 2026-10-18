const paths = {
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  arrowLeft: "M19 12H5m6 6-6-6 6-6",
  chevronUp: "m6 15 6-6 6 6",
  chevronDown: "m6 9 6 6 6-6",
  sparkles:
    "m12 3-1.7 5.3L5 10l5.3 1.7L12 17l1.7-5.3L19 10l-5.3-1.7L12 3ZM5 15l-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8L5 15Z",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z",
  bookmark:
    "M6 3.5A1.5 1.5 0 0 1 7.5 2h9A1.5 1.5 0 0 1 18 3.5V22l-6-3.6L6 22V3.5Z",
  x: "M18 6 6 18M6 6l12 12",
  search: "m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  bag: "M6 8h12l1 13H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2",
  star: "m12 2.8 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.3l6.2-.9L12 2.8Z",
  chevronRight: "m9 18 6-6-6-6",
  rotate: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  share:
    "M18 5a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM9 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm9 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm-8.4-5.5 4.8 2.9m0-8.8-4.8 2.9",
  compass:
    "m12 2 3.2 6.8L22 12l-6.8 3.2L12 22l-3.2-6.8L2 12l6.8-3.2L12 2Zm0 7.4L9.4 12l2.6 2.6 2.6-2.6L12 9.4Z",
  scroll:
    "M7 4h10M7 10h10M7 16h10M12 2v19m-3-3 3 3 3-3",
  target:
    "M12 2a10 10 0 1 1-10 10M12 7a5 5 0 1 1-5 5m5-2a2 2 0 1 1-2 2m2-2 8-8",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5",
  wallet:
    "M4 6h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2h13M16 14h3",
  cart:
    "M3 3h2l2.2 11.2A2 2 0 0 0 9.2 16h8.9a2 2 0 0 0 2-1.6L22 7H6m4 13h.01M18 20h.01",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18-6v-1a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7a4 4 0 0 1 0 7.8",
  user: "M20 21a8 8 0 0 0-16 0m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  message:
    "M21 11.5a8 8 0 0 1-8.5 8 9 9 0 0 1-4-.9L3 20l1.5-4.5A8 8 0 1 1 21 11.5Z",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4.2 4.2L19 6.4",
  zap: "m13 2-9 12h7l-1 8 10-13h-7l1-7Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  close: "M18 6 6 18M6 6l12 12",
};

export default function Icon({
  name,
  size = 18,
  filled = false,
  className = "",
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill={filled ? "currentColor" : "none"}
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={paths[name] || paths.sparkles} />
    </svg>
  );
}
