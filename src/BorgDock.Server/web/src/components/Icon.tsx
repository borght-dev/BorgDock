const paths = {
  inbox: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 12h5l2 3h4l2-3h5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  sync: <path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  link: <path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2M14 18l-2 2a5 5 0 0 1-7-7l2-2" />,
  check: <path d="m5 12 4 4L19 6" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3M16 8l3-3" /></>,
  external: <path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />,
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
