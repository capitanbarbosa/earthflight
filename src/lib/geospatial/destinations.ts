import { DEG } from "@/engine/math3";
import { greatCircleDistance } from "@/engine/coordinates";

export interface Landmark {
  name: string;
  lat: number;
  lon: number;
}

export interface Destination {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Short editorial blurb (used on destination pages). */
  blurb: string;
  /** Things worth flying to; used for markers and page copy. */
  landmarks: Landmark[];
  /** Shown in the popular list. */
  popular: boolean;
  /** Has a dedicated indexable page. */
  featured: boolean;
  aliases?: string[];
}

export const DESTINATIONS: Destination[] = [
  {
    id: "new-york", name: "New York", country: "United States", lat: 40.758, lon: -73.9855, popular: true, featured: true,
    aliases: ["nyc", "manhattan", "new york city"],
    blurb: "Dense Manhattan skyscrapers, the grid of Midtown, Central Park and the harbor make New York one of the best places to practice precise low-altitude flying between towers.",
    landmarks: [
      { name: "Statue of Liberty", lat: 40.6892, lon: -74.0445 },
      { name: "Empire State Building", lat: 40.7484, lon: -73.9857 },
      { name: "One World Trade Center", lat: 40.7127, lon: -74.0134 },
      { name: "Central Park", lat: 40.7829, lon: -73.9654 },
      { name: "Brooklyn Bridge", lat: 40.7061, lon: -73.9969 },
    ],
  },
  {
    id: "tokyo", name: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503, popular: true, featured: true,
    blurb: "The largest metropolitan area on Earth sprawls to the horizon. Fly from Tokyo Bay over Shibuya and Shinjuku, then climb to see Mount Fuji on a clear day.",
    landmarks: [
      { name: "Tokyo Tower", lat: 35.6586, lon: 139.7454 },
      { name: "Tokyo Skytree", lat: 35.7101, lon: 139.8107 },
      { name: "Shibuya Crossing", lat: 35.6595, lon: 139.7005 },
      { name: "Imperial Palace", lat: 35.6852, lon: 139.7528 },
    ],
  },
  {
    id: "london", name: "London", country: "United Kingdom", lat: 51.5072, lon: -0.1276, popular: true, featured: true,
    blurb: "Follow the River Thames from Tower Bridge to the Houses of Parliament, weave through the City of London's skyscrapers and loop around the London Eye.",
    landmarks: [
      { name: "Big Ben", lat: 51.5007, lon: -0.1246 },
      { name: "Tower Bridge", lat: 51.5055, lon: -0.0754 },
      { name: "London Eye", lat: 51.5033, lon: -0.1195 },
      { name: "The Shard", lat: 51.5045, lon: -0.0865 },
      { name: "Buckingham Palace", lat: 51.5014, lon: -0.1419 },
    ],
  },
  {
    id: "paris", name: "Paris", country: "France", lat: 48.8566, lon: 2.3522, popular: true, featured: true,
    blurb: "A low-rise city built around grand avenues. Fly along the Seine, circle the Eiffel Tower and trace the star of roads around the Arc de Triomphe.",
    landmarks: [
      { name: "Eiffel Tower", lat: 48.8584, lon: 2.2945 },
      { name: "Louvre", lat: 48.8606, lon: 2.3376 },
      { name: "Notre-Dame", lat: 48.853, lon: 2.3499 },
      { name: "Arc de Triomphe", lat: 48.8738, lon: 2.295 },
      { name: "Sacré-Cœur", lat: 48.8867, lon: 2.3431 },
    ],
  },
  {
    id: "dubai", name: "Dubai", country: "United Arab Emirates", lat: 25.2048, lon: 55.2708, popular: true, featured: true,
    blurb: "Desert meets the Gulf: the Burj Khalifa towers over Downtown, Palm Jumeirah juts into the sea and Dubai Marina forms a canyon of glass.",
    landmarks: [
      { name: "Burj Khalifa", lat: 25.1972, lon: 55.2744 },
      { name: "Palm Jumeirah", lat: 25.1124, lon: 55.139 },
      { name: "Burj Al Arab", lat: 25.1412, lon: 55.1853 },
      { name: "Dubai Marina", lat: 25.0805, lon: 55.1403 },
    ],
  },
  {
    id: "singapore", name: "Singapore", country: "Singapore", lat: 1.2903, lon: 103.8519, popular: true, featured: true,
    blurb: "A compact island city-state, just north of the equator. Marina Bay, Gardens by the Bay and the container ports are all minutes apart.",
    landmarks: [
      { name: "Marina Bay Sands", lat: 1.2834, lon: 103.8607 },
      { name: "Gardens by the Bay", lat: 1.2816, lon: 103.8636 },
      { name: "Merlion", lat: 1.2868, lon: 103.8545 },
      { name: "Sentosa", lat: 1.2494, lon: 103.8303 },
    ],
  },
  {
    id: "cartagena", name: "Cartagena", country: "Colombia", lat: 10.4236, lon: -75.5513, popular: true, featured: true,
    aliases: ["cartagena de indias"],
    blurb: "The walled colonial city on the Caribbean coast, with the Castillo San Felipe fortress, the Bocagrande skyline and the Bay of Cartagena.",
    landmarks: [
      { name: "Castillo San Felipe de Barajas", lat: 10.4227, lon: -75.5392 },
      { name: "Torre del Reloj (Walled City)", lat: 10.4236, lon: -75.5513 },
      { name: "Bocagrande", lat: 10.4012, lon: -75.5584 },
      { name: "Convento de la Popa", lat: 10.4214, lon: -75.5283 },
    ],
  },
  {
    id: "medellin", name: "Medellín", country: "Colombia", lat: 6.2442, lon: -75.5812, popular: true, featured: true,
    aliases: ["medellin"],
    blurb: "Set in the Aburrá Valley between steep Andean ridgelines — a great place to practice terrain-aware flight with mountains on both sides of the city.",
    landmarks: [
      { name: "Pueblito Paisa", lat: 6.2349, lon: -75.5791 },
      { name: "Plaza Botero", lat: 6.2518, lon: -75.5686 },
      { name: "Estadio Atanasio Girardot", lat: 6.2565, lon: -75.5905 },
      { name: "El Poblado", lat: 6.2084, lon: -75.5667 },
    ],
  },
  {
    id: "san-francisco", name: "San Francisco", country: "United States", lat: 37.7749, lon: -122.4194, popular: true, featured: true,
    blurb: "Steep hills, the Golden Gate Bridge, Alcatraz and the Bay: fly under the fog line and over the Financial District.",
    landmarks: [
      { name: "Golden Gate Bridge", lat: 37.8199, lon: -122.4783 },
      { name: "Alcatraz", lat: 37.8267, lon: -122.423 },
      { name: "Transamerica Pyramid", lat: 37.7952, lon: -122.4028 },
    ],
  },
  {
    id: "rio-de-janeiro", name: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lon: -43.1729, popular: true, featured: true,
    aliases: ["rio"],
    blurb: "Granite domes rise straight out of the city. Circle Christ the Redeemer, drop toward Sugarloaf and follow the Copacabana shoreline.",
    landmarks: [
      { name: "Christ the Redeemer", lat: -22.9519, lon: -43.2105 },
      { name: "Sugarloaf Mountain", lat: -22.9486, lon: -43.1566 },
      { name: "Maracanã Stadium", lat: -22.9122, lon: -43.2302 },
    ],
  },
  {
    id: "sydney", name: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093, popular: true, featured: true,
    blurb: "A harbor city of inlets and headlands. Skim past the Opera House and Harbour Bridge, then follow the coastline to the open Pacific.",
    landmarks: [
      { name: "Sydney Opera House", lat: -33.8568, lon: 151.2153 },
      { name: "Sydney Harbour Bridge", lat: -33.8523, lon: 151.2108 },
    ],
  },
  {
    id: "cairo", name: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357, popular: true, featured: true,
    blurb: "Where the Nile delta meets the desert. The Pyramids of Giza sit on the plateau just west of the dense city.",
    landmarks: [{ name: "Pyramids of Giza", lat: 29.9792, lon: 31.1342 }],
  },
  { id: "los-angeles", name: "Los Angeles", country: "United States", lat: 34.0522, lon: -118.2437, popular: false, featured: false, aliases: ["la"], blurb: "", landmarks: [{ name: "Hollywood Sign", lat: 34.1341, lon: -118.3215 }, { name: "Griffith Observatory", lat: 34.1184, lon: -118.3004 }] },
  { id: "chicago", name: "Chicago", country: "United States", lat: 41.8781, lon: -87.6298, popular: false, featured: false, blurb: "", landmarks: [{ name: "Willis Tower", lat: 41.8789, lon: -87.6359 }, { name: "Cloud Gate", lat: 41.8827, lon: -87.6233 }] },
  { id: "las-vegas", name: "Las Vegas", country: "United States", lat: 36.1147, lon: -115.1728, popular: false, featured: false, blurb: "", landmarks: [{ name: "Bellagio Fountains", lat: 36.1126, lon: -115.1767 }, { name: "Stratosphere Tower", lat: 36.1475, lon: -115.1556 }] },
  { id: "toronto", name: "Toronto", country: "Canada", lat: 43.6532, lon: -79.3832, popular: false, featured: false, blurb: "", landmarks: [{ name: "CN Tower", lat: 43.6426, lon: -79.3871 }] },
  { id: "mexico-city", name: "Mexico City", country: "Mexico", lat: 19.4326, lon: -99.1332, popular: false, featured: false, aliases: ["cdmx"], blurb: "", landmarks: [{ name: "Zócalo", lat: 19.4326, lon: -99.1332 }, { name: "Ángel de la Independencia", lat: 19.427, lon: -99.1677 }] },
  { id: "bogota", name: "Bogotá", country: "Colombia", lat: 4.711, lon: -74.0721, popular: false, featured: false, aliases: ["bogota"], blurb: "", landmarks: [{ name: "Monserrate", lat: 4.6058, lon: -74.056 }, { name: "Torre Colpatria", lat: 4.6102, lon: -74.0693 }] },
  { id: "buenos-aires", name: "Buenos Aires", country: "Argentina", lat: -34.6037, lon: -58.3816, popular: false, featured: false, blurb: "", landmarks: [{ name: "Obelisco", lat: -34.6037, lon: -58.3816 }] },
  { id: "rome", name: "Rome", country: "Italy", lat: 41.9028, lon: 12.4964, popular: false, featured: false, blurb: "", landmarks: [{ name: "Colosseum", lat: 41.8902, lon: 12.4922 }, { name: "St. Peter's Basilica", lat: 41.9022, lon: 12.4539 }] },
  { id: "barcelona", name: "Barcelona", country: "Spain", lat: 41.3874, lon: 2.1686, popular: false, featured: false, blurb: "", landmarks: [{ name: "Sagrada Família", lat: 41.4036, lon: 2.1744 }] },
  { id: "berlin", name: "Berlin", country: "Germany", lat: 52.52, lon: 13.405, popular: false, featured: false, blurb: "", landmarks: [{ name: "Brandenburg Gate", lat: 52.5163, lon: 13.3777 }] },
  { id: "istanbul", name: "Istanbul", country: "Türkiye", lat: 41.0082, lon: 28.9784, popular: false, featured: false, aliases: ["turkey"], blurb: "", landmarks: [{ name: "Hagia Sophia", lat: 41.0086, lon: 28.9802 }, { name: "Galata Tower", lat: 41.0256, lon: 28.9741 }] },
  { id: "moscow", name: "Moscow", country: "Russia", lat: 55.7558, lon: 37.6173, popular: false, featured: false, blurb: "", landmarks: [{ name: "Saint Basil's Cathedral", lat: 55.7525, lon: 37.6231 }] },
  { id: "mumbai", name: "Mumbai", country: "India", lat: 19.076, lon: 72.8777, popular: false, featured: false, blurb: "", landmarks: [{ name: "Gateway of India", lat: 18.922, lon: 72.8347 }] },
  { id: "hong-kong", name: "Hong Kong", country: "China", lat: 22.3193, lon: 114.1694, popular: false, featured: false, blurb: "", landmarks: [{ name: "Victoria Peak", lat: 22.2759, lon: 114.1455 }, { name: "International Finance Centre", lat: 22.285, lon: 114.1585 }] },
  { id: "shanghai", name: "Shanghai", country: "China", lat: 31.2304, lon: 121.4737, popular: false, featured: false, blurb: "", landmarks: [{ name: "Oriental Pearl Tower", lat: 31.2397, lon: 121.4998 }, { name: "Shanghai Tower", lat: 31.2335, lon: 121.5055 }] },
  { id: "seoul", name: "Seoul", country: "South Korea", lat: 37.5665, lon: 126.978, popular: false, featured: false, blurb: "", landmarks: [{ name: "N Seoul Tower", lat: 37.5512, lon: 126.9882 }, { name: "Lotte World Tower", lat: 37.5126, lon: 127.1025 }] },
  { id: "cape-town", name: "Cape Town", country: "South Africa", lat: -33.9249, lon: 18.4241, popular: false, featured: false, blurb: "", landmarks: [{ name: "Table Mountain", lat: -33.9628, lon: 18.4098 }] },
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const getDestination = (id: string) => DESTINATIONS.find((d) => d.id === id);
export const FEATURED = DESTINATIONS.filter((d) => d.featured);
export const POPULAR = DESTINATIONS.filter((d) => d.popular);

export interface SearchHit {
  destination: Destination;
  /** If the hit is a landmark inside a destination. */
  landmark?: Landmark;
  score: number;
}

/** Offline fuzzy search over cities, aliases, countries and landmarks. */
export function searchDestinations(query: string, limit = 8): SearchHit[] {
  const q = norm(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const d of DESTINATIONS) {
    const names = [d.name, ...(d.aliases ?? [])].map(norm);
    let best = 0;
    for (const n of names) {
      if (n === q) best = Math.max(best, 100);
      else if (n.startsWith(q)) best = Math.max(best, 80 - Math.min(20, n.length - q.length));
      else if (n.split(/\s+/).some((w) => w.startsWith(q))) best = Math.max(best, 60);
      else if (n.includes(q)) best = Math.max(best, 40);
    }
    const country = norm(d.country);
    if (!best && country.startsWith(q)) best = 25;
    if (best) hits.push({ destination: d, score: best + (d.popular ? 3 : 0) });
    for (const l of d.landmarks) {
      const ln = norm(l.name);
      if (ln.startsWith(q) || ln.split(/\s+/).some((w) => w.startsWith(q)) || (q.length > 2 && ln.includes(q)))
        hits.push({ destination: d, landmark: l, score: ln.startsWith(q) ? 55 : 35 });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Nearest known place to a position (for the HUD "region" readout). */
export function nearestPlace(latDeg: number, lonDeg: number): { name: string; distance: number; landmark?: boolean } | null {
  let best: { name: string; distance: number; landmark?: boolean } | null = null;
  const la = latDeg * DEG, lo = lonDeg * DEG;
  for (const d of DESTINATIONS) {
    const dist = greatCircleDistance(la, lo, d.lat * DEG, d.lon * DEG);
    if (!best || dist < best.distance) best = { name: `${d.name}, ${d.country}`, distance: dist };
    for (const l of d.landmarks) {
      const ld = greatCircleDistance(la, lo, l.lat * DEG, l.lon * DEG);
      if (ld < 1200 && (!best || ld < best.distance - 1)) best = { name: l.name, distance: ld, landmark: true };
    }
  }
  return best;
}
